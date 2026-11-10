// Step 1 of the live pipeline: Codeforces -> MySQL (+ raw JSON into ingest_outbox)
//
//   node scripts/sync/poll-submissions.js      # one poll, then exit
//   (the worker calls pollOnce every 5 seconds)
//
// Each poll:
//   1. fetches the latest submissions (problemset.recentStatus)
//   2. drops the ones we already stored with the same verdict (in-memory cache)
//   3. fetches profiles only for handles MySQL has never seen (user.info)
//   4. in ONE transaction: upserts accounts, problems, submissions and writes the raw JSON
//      to ingest_outbox, so MySQL and the outbox can never disagree
//
// Duplicates: UNIQUE (platform_id, external_id) on submission. A known id is UPDATEd
// (TESTING -> final verdict) instead of inserted again; trg_submission_verdict_change
// fixes the accepted count.

import "../env.js";
import { cfRequest, getRecentSubmissions } from "../codeforces/api.js";
import { normalizeProblem, normalizeSubmission, normalizeUser } from "../codeforces/normalize.js";
import { getPool, closePool } from "../../lib/db/mysql.js";
import { isMain, runJob } from "./run-job.js";

const SEEN_LIMIT = 20000;

// Remembers submission id -> verdict we last stored, so an unchanged submission
// costs no database work on the next poll.
export function createPollState() {
  return { seen: new Map(), platformId: null, verdictIds: new Map() };
}

function remember(state, id, verdict) {
  state.seen.delete(id);                // re-insert so the Map stays in "recently used" order
  state.seen.set(id, verdict);
  if (state.seen.size > SEEN_LIMIT) {
    state.seen.delete(state.seen.keys().next().value);
  }
}

const toMySQLDate = (iso) => (iso ? new Date(iso) : null);

// user.info fails the whole batch if one handle no longer exists: drop it and retry.
async function fetchUsers(handles) {
  const users = [];
  for (let i = 0; i < handles.length; i += 50) {
    let batch = handles.slice(i, i + 50);
    while (batch.length > 0) {
      try {
        users.push(...(await cfRequest("user.info", { handles: batch.join(";") })));
        break;
      } catch (error) {
        const missing = error.message.match(/handle (\S+) not found/i)?.[1];
        if (!missing) throw error;
        batch = batch.filter((h) => h.toLowerCase() !== missing.toLowerCase());
      }
    }
  }
  return users;
}

async function getPlatformId(db, state) {
  if (!state.platformId) {
    await db.execute("INSERT IGNORE INTO platform (name) VALUES ('Codeforces')");
    const [[row]] = await db.execute("SELECT platform_id FROM platform WHERE name = 'Codeforces'");
    state.platformId = row.platform_id;
  }
  return state.platformId;
}

async function getVerdictId(db, state, code) {
  if (!state.verdictIds.has(code)) {
    // INSERT IGNORE: a verdict code Codeforces invents later never breaks the FK
    await db.execute("INSERT IGNORE INTO verdict (code, is_accepted) VALUES (?, ?)", [code, code === "OK"]);
    const [[row]] = await db.execute("SELECT verdict_id FROM verdict WHERE code = ?", [code]);
    state.verdictIds.set(code, row.verdict_id);
  }
  return state.verdictIds.get(code);
}

async function outbox(db, kind, key, payload) {
  await db.execute(
    "INSERT INTO ingest_outbox (kind, external_key, payload) VALUES (?, ?, ?)",
    [kind, String(key), JSON.stringify(payload)]
  );
}

// Same location rules as import-mysql.js
async function upsertAccount(db, platformId, user, rawUser) {
  let countryId = null;
  if (user.country) {
    await db.execute("INSERT IGNORE INTO country (name) VALUES (?)", [user.country]);
    const [[c]] = await db.execute("SELECT country_id FROM country WHERE name = ?", [user.country]);
    countryId = c.country_id;
  }

  let cityId = null;
  if (user.city && countryId) {
    const [[alias]] = await db.execute(
      `SELECT al.city_id FROM city_alias al JOIN city c ON c.city_id = al.city_id
        WHERE al.raw_text = ? AND al.country_id = ? AND c.country_id = ?`,
      [user.city.trim(), countryId, countryId]
    );
    cityId = alias?.city_id ?? null;
  }

  const status = cityId ? "CITY_RESOLVED"
    : user.city ? "UNRESOLVED"
    : countryId ? "COUNTRY_ONLY"
    : "UNKNOWN";

  await db.execute(
    `INSERT INTO platform_account
       (platform_id, handle, raw_city, raw_country, city_id, country_id, location_status, rating, last_synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       raw_city = VALUES(raw_city), raw_country = VALUES(raw_country),
       city_id = VALUES(city_id), country_id = VALUES(country_id),
       location_status = VALUES(location_status), rating = VALUES(rating),
       last_synced_at = VALUES(last_synced_at)`,
    [platformId, user.handle, user.city?.trim() || null, user.country, cityId, countryId, status, user.rating]
  );
  await outbox(db, "user", user.handle, rawUser);
}

async function upsertProblem(db, platformId, rawProblem) {
  const problem = normalizeProblem(rawProblem);

  let contestId = null;
  if (problem.contestExternalId) {
    // name stays NULL until contest.list is imported (allowed by the schema)
    await db.execute(
      "INSERT IGNORE INTO contest (platform_id, external_id) VALUES (?, ?)",
      [platformId, problem.contestExternalId]
    );
    const [[c]] = await db.execute(
      "SELECT contest_id FROM contest WHERE platform_id = ? AND external_id = ?",
      [platformId, problem.contestExternalId]
    );
    contestId = c.contest_id;
  }

  await db.execute(
    `INSERT INTO problem (platform_id, contest_id, external_key, name, rating)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE name = VALUES(name), rating = COALESCE(VALUES(rating), rating)`,
    [platformId, contestId, problem.externalKey, problem.name, problem.rating]
  );
  const [[p]] = await db.execute(
    "SELECT problem_id FROM problem WHERE platform_id = ? AND external_key = ?",
    [platformId, problem.externalKey]
  );

  for (const tag of problem.tags) {
    await db.execute("INSERT IGNORE INTO tag (name) VALUES (?)", [tag]);
    await db.execute(
      "INSERT IGNORE INTO problem_tag (problem_id, tag_id) SELECT ?, tag_id FROM tag WHERE name = ?",
      [p.problem_id, tag]
    );
  }
  await outbox(db, "problem", problem.externalKey, rawProblem);
  return p.problem_id;
}

export async function pollOnce(pool, state, { count = 300 } = {}) {
  const raw = await getRecentSubmissions(count);

  // 1. keep only submissions that are new, or whose verdict changed since we stored them
  const changed = raw.filter((s) => state.seen.get(s.id) !== (s.verdict ?? "TESTING"));
  if (changed.length === 0) return { fetched: raw.length, inserted: 0, updated: 0 };

  const submissions = changed.map((s) => ({ raw: s, norm: normalizeSubmission(s) }))
    .filter(({ norm }) => norm.participants.length > 0);

  const db = await pool.getConnection();
  try {
    const platformId = await getPlatformId(db, state);

    // 2. profiles only for handles MySQL does not have yet
    const handles = [...new Set(submissions.map(({ norm }) => norm.participants[0]))];
    const [known] = await db.query(
      "SELECT handle, account_id FROM platform_account WHERE platform_id = ? AND handle IN (?)",
      [platformId, handles]
    );
    const accountIds = new Map(known.map((r) => [r.handle.toLowerCase(), r.account_id]));
    const newHandles = handles.filter((h) => !accountIds.has(h.toLowerCase()));
    const newUsers = newHandles.length ? await fetchUsers(newHandles) : [];   // network: before the transaction

    // 3. problems we have never seen
    const keys = [...new Set(submissions.map(({ norm }) => norm.problemExternalKey))];
    const [knownProblems] = await db.query(
      "SELECT external_key, problem_id FROM problem WHERE platform_id = ? AND external_key IN (?)",
      [platformId, keys]
    );
    const problemIds = new Map(knownProblems.map((r) => [r.external_key, r.problem_id]));

    let inserted = 0;
    let updated = 0;

    // 4. one transaction for everything
    await db.beginTransaction();
    try {
      for (const rawUser of newUsers) {
        await upsertAccount(db, platformId, normalizeUser(rawUser), rawUser);
      }
      if (newUsers.length) {
        const [rows] = await db.query(
          "SELECT handle, account_id FROM platform_account WHERE platform_id = ? AND handle IN (?)",
          [platformId, newUsers.map((u) => u.handle)]
        );
        for (const r of rows) accountIds.set(r.handle.toLowerCase(), r.account_id);
      }

      for (const { raw: s, norm } of submissions) {
        const accountId = accountIds.get(norm.participants[0].toLowerCase());
        if (!accountId) continue;            // handle vanished from Codeforces

        let problemId = problemIds.get(norm.problemExternalKey);
        if (!problemId) {
          problemId = await upsertProblem(db, platformId, s.problem);
          problemIds.set(norm.problemExternalKey, problemId);
        }

        const verdict = s.verdict ?? "TESTING";
        const verdictId = await getVerdictId(db, state, verdict);

        // affectedRows: 1 = inserted, 2 = existing row changed, 0 = identical row
        const [result] = await db.execute(
          `INSERT INTO submission
             (platform_id, external_id, account_id, problem_id, verdict_id, language, submitted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE verdict_id = VALUES(verdict_id)`,
          [platformId, s.id, accountId, problemId, verdictId, norm.language?.slice(0, 50) ?? null,
           toMySQLDate(norm.submittedAt)]
        );

        if (result.affectedRows === 1) inserted++;
        if (result.affectedRows === 2) updated++;
        if (result.affectedRows > 0) await outbox(db, "submission", s.id, s);
      }

      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    }

    // only after COMMIT: otherwise a rolled-back batch would be skipped forever
    for (const { raw: s } of submissions) remember(state, s.id, s.verdict ?? "TESTING");

    return {
      fetched: raw.length,
      inserted,
      updated,
      message: newUsers.length ? `${newUsers.length} new accounts` : null,
    };
  } finally {
    db.release();
  }
}

// ---------------------------------------------------------------- run directly
if (isMain(import.meta.url)) {
  const pool = getPool();
  const result = await runJob(pool, "poll", () => pollOnce(pool, createPollState(), {
    count: Number(process.env.POLL_COUNT ?? 300),
  }), { logIdle: true });
  console.log(result);
  await closePool();
}
