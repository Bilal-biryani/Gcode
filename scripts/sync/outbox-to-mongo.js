// Step 2 of the live pipeline: MySQL ingest_outbox -> MongoDB raw_* collections
//
//   node scripts/sync/outbox-to-mongo.js      # copy everything pending, then exit
//   (the worker runs this every 15 seconds)
//
// Reads the raw Codeforces JSON the poller stored in MySQL and upserts it into MongoDB:
//   submission -> raw_submissions (by id)    a TESTING doc is replaced by its final verdict
//   user       -> raw_users       (by handle)
//   problem    -> raw_problems    (by key, e.g. '2060A')
//
// Upserts make it safe to repeat: if the process dies after writing MongoDB but before
// stamping processed_at, the next run writes the same documents again, with no duplicates.

import "../env.js";
import { normalizeProblem } from "../codeforces/normalize.js";
import { getPool, closePool } from "../../lib/db/mysql.js";
import { getMongoDb, closeMongo } from "../../lib/db/mongodb.js";
import { isMain, runJob } from "./run-job.js";

const BATCH = 1000;

const TARGETS = {
  submission: { collection: "raw_submissions", filter: (doc) => ({ id: doc.id }) },
  user: { collection: "raw_users", filter: (doc) => ({ handle: doc.handle }) },
  problem: { collection: "raw_problems", filter: (doc) => ({ key: doc.key }) },
};

export async function ensureRawIndexes(mongo) {
  // unique: the database itself refuses a second copy of the same submission/user/problem
  await mongo.collection("raw_submissions").createIndex({ id: 1 }, { unique: true });
  await mongo.collection("raw_users").createIndex({ handle: 1 }, { unique: true });
  await mongo.collection("raw_problems").createIndex({ key: 1 }, { unique: true });
  await mongo.collection("raw_submissions").createIndex({ creationTimeSeconds: -1 });
}

function toDocument(kind, payload) {
  const doc = typeof payload === "string" ? JSON.parse(payload) : payload;
  // same key as MySQL problem.external_key (see normalizeProblem)
  if (kind === "problem") doc.key = normalizeProblem(doc).externalKey;
  doc._syncedAt = new Date();
  return doc;
}

export async function syncOutboxOnce(pool, mongo) {
  let copied = 0;

  // keep going until the backlog is empty (the poller may have queued a lot on the first run)
  for (;;) {
    const [rows] = await pool.query(
      `SELECT outbox_id, kind, payload FROM ingest_outbox
        WHERE processed_at IS NULL ORDER BY outbox_id LIMIT ?`,
      [BATCH]
    );
    if (rows.length === 0) break;

    // last write wins inside a batch: rows are in outbox_id order, so a later
    // verdict for the same submission replaces the earlier TESTING one
    const byKind = new Map();
    for (const row of rows) {
      const doc = toDocument(row.kind, row.payload);
      const target = TARGETS[row.kind];
      const ops = byKind.get(row.kind) ?? new Map();
      ops.set(JSON.stringify(target.filter(doc)), { replaceOne: { filter: target.filter(doc), replacement: doc, upsert: true } });
      byKind.set(row.kind, ops);
    }

    for (const [kind, ops] of byKind) {
      await mongo.collection(TARGETS[kind].collection).bulkWrite([...ops.values()], { ordered: false });
    }

    await pool.query(
      "UPDATE ingest_outbox SET processed_at = UTC_TIMESTAMP(3) WHERE outbox_id IN (?)",
      [rows.map((r) => r.outbox_id)]
    );
    copied += rows.length;
    if (rows.length < BATCH) break;
  }

  return { fetched: copied, inserted: copied, updated: 0 };
}

// ---------------------------------------------------------------- run directly
if (isMain(import.meta.url)) {
  const pool = getPool();
  const mongo = await getMongoDb();
  await ensureRawIndexes(mongo);
  console.log(await runJob(pool, "mongo", () => syncOutboxOnce(pool, mongo), { logIdle: true }));
  await closePool();
  await closeMongo();
}
