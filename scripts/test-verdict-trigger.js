// Checks the TESTING -> final verdict lifecycle from the project guide (section 10).
// Runs inside a transaction and rolls back, so it leaves the database unchanged.
//
//   node scripts/test-verdict-trigger.js

import "./env.js";
import { getPool, closePool } from "../lib/db/mysql.js";

const pool = getPool();
const db = await pool.getConnection();
let failed = 0;

const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

try {
  await db.beginTransaction();

  // a throwaway platform/country/city/account/problem to hang the submission on
  await db.query("INSERT INTO platform (name) VALUES ('TriggerTest')");
  const [[{ id: platformId }]] = await db.query("SELECT LAST_INSERT_ID() AS id");
  await db.query("INSERT INTO country (name) VALUES ('Triggerland')");
  const [[{ id: countryId }]] = await db.query("SELECT LAST_INSERT_ID() AS id");
  await db.query("INSERT INTO city (country_id, name, latitude, longitude) VALUES (?, 'Testville', 0, 0)", [countryId]);
  const [[{ id: cityId }]] = await db.query("SELECT LAST_INSERT_ID() AS id");
  await db.query(
    `INSERT INTO platform_account (platform_id, handle, city_id, country_id, location_status)
     VALUES (?, 'trigger_tester', ?, ?, 'CITY_RESOLVED')`, [platformId, cityId, countryId]);
  const [[{ id: accountId }]] = await db.query("SELECT LAST_INSERT_ID() AS id");
  await db.query("INSERT INTO problem (platform_id, external_key, name) VALUES (?, 'T1', 'Trigger problem')", [platformId]);
  const [[{ id: problemId }]] = await db.query("SELECT LAST_INSERT_ID() AS id");

  const verdict = async (code) => (await db.query("SELECT verdict_id FROM verdict WHERE code = ?", [code]))[0][0].verdict_id;
  const stats = async () => {
    const [[row]] = await db.query(
      "SELECT total_submissions AS total, accepted_submissions AS accepted FROM city_daily_stats WHERE city_id = ?", [cityId]);
    return row ? [row.total, row.accepted] : null;
  };
  const upsert = async (code) => db.query(
    `INSERT INTO submission (platform_id, external_id, account_id, problem_id, verdict_id, submitted_at)
     VALUES (?, 999999999, ?, ?, ?, '2026-11-09 10:00:00')
     ON DUPLICATE KEY UPDATE verdict_id = VALUES(verdict_id)`,
    [platformId, accountId, problemId, await verdict(code)]);

  await upsert("TESTING");
  check("insert TESTING            [total, accepted]", await stats(), [1, 0]);
  await upsert("OK");
  check("TESTING -> OK             [total, accepted]", await stats(), [1, 1]);
  await upsert("OK");
  check("OK again (no change)      [total, accepted]", await stats(), [1, 1]);
  await upsert("WRONG_ANSWER");
  check("OK -> WRONG_ANSWER        [total, accepted]", await stats(), [1, 0]);
  const [[{ n }]] = await db.query("SELECT COUNT(*) AS n FROM submission WHERE platform_id = ?", [platformId]);
  check("rows for that submission id", n, 1);
} finally {
  await db.rollback();
  db.release();
  await closePool();
}

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed (changes rolled back)");
process.exitCode = failed ? 1 : 0;
