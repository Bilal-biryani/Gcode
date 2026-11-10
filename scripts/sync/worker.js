// The live pipeline in one long-running process:
//
//   npm run worker
//
//   every  5 s   poll       Codeforces recentStatus -> MySQL + ingest_outbox
//   every 15 s   mongo      ingest_outbox -> MongoDB raw_* (upsert)
//   every  5 min analytics  raw_submissions -> city_analytics (what the globe reads)
//   every  5 min geocode    new city text -> city / city_alias, then re-resolve accounts
//   every  1 h   cleanup    DELETE processed outbox rows and old sync_run rows
//
// Each job waits for its previous run to finish before scheduling the next one,
// so a slow run never overlaps itself. Ctrl+C stops it cleanly.

import "../env.js";
import { getPool, closePool } from "../../lib/db/mysql.js";
import { getMongoDb, closeMongo } from "../../lib/db/mongodb.js";
import { createPollState, pollOnce } from "./poll-submissions.js";
import { ensureRawIndexes, syncOutboxOnce } from "./outbox-to-mongo.js";
import { geocodePendingOnce } from "./geocode-pending.js";
import { runJob } from "./run-job.js";
import analytics from "../build-city-analytics.cjs";

const env = (name, fallback) => Number(process.env[name] ?? fallback);

const POLL_MS = env("POLL_INTERVAL_MS", 5000);
const POLL_COUNT = env("POLL_COUNT", 300);
const MONGO_MS = env("MONGO_SYNC_INTERVAL_MS", 15000);
const ANALYTICS_MS = env("ANALYTICS_INTERVAL_MS", 5 * 60 * 1000);
const GEOCODE_MS = env("GEOCODE_INTERVAL_MS", 5 * 60 * 1000);
const CLEANUP_MS = 60 * 60 * 1000;

const time = () => new Date().toISOString().slice(11, 19);
const timers = new Set();
let stopping = false;

// Run `fn` now, then again `interval` ms after it finishes. `nextDelay` can stretch the wait (backoff).
function every(name, interval, fn, nextDelay = () => interval) {
  const tick = async () => {
    if (stopping) return;
    const result = await fn();
    if (stopping) return;
    const timer = setTimeout(() => { timers.delete(timer); tick(); }, nextDelay(result));
    timers.add(timer);
  };
  return tick();
}

async function main() {
  const pool = getPool();
  const mongo = await getMongoDb();
  await pool.query("SELECT 1");
  await ensureRawIndexes(mongo);
  console.log(`[${time()}] worker started: poll ${POLL_MS / 1000}s, mongo ${MONGO_MS / 1000}s, `
    + `analytics ${ANALYTICS_MS / 60000}min, geocode ${GEOCODE_MS / 60000}min`);

  const pollState = createPollState();
  let pollFailures = 0;

  every("poll", POLL_MS, async () => {
    const r = await runJob(pool, "poll", () => pollOnce(pool, pollState, { count: POLL_COUNT }));
    pollFailures = r.status === "FAILED" ? pollFailures + 1 : 0;
    if (r.inserted || r.updated) {
      console.log(`[${time()}] poll: +${r.inserted} new, ${r.updated} verdict updates${r.message ? `, ${r.message}` : ""}`);
    }
    return r;
  // Codeforces down or rate-limiting us: back off 10s, 20s, 40s ... up to 2 min
  }, () => (pollFailures ? Math.min(POLL_MS * 2 ** pollFailures, 120000) : POLL_MS));

  every("mongo", MONGO_MS, async () => {
    const r = await runJob(pool, "mongo", () => syncOutboxOnce(pool, mongo));
    if (r.inserted) console.log(`[${time()}] mongo: ${r.inserted} documents upserted`);
  });

  // first build after the first mongo sync has had a moment to run
  setTimeout(() => every("analytics", ANALYTICS_MS, async () => {
    const r = await runJob(pool, "analytics", async () => {
      await syncOutboxOnce(pool, mongo);    // include everything polled so far
      const b = await analytics.buildCityAnalytics({ my: pool, db: mongo, verify: false, log: () => {} });
      return { fetched: b.rawTotal, inserted: b.cities, updated: 0, message: `${b.cities} cities from ${b.usable} usable submissions` };
    }, { logIdle: true });
    console.log(`[${time()}] analytics: ${r.message}`);
  }), 20000);

  every("geocode", GEOCODE_MS, async () => {
    const r = await runJob(pool, "geocode", () => geocodePendingOnce(pool));
    if (r.message) console.log(`[${time()}] geocode: ${r.message}`);
  });

  setTimeout(() => every("cleanup", CLEANUP_MS, () => runJob(pool, "cleanup", async () => {
    const [outbox] = await pool.query(
      "DELETE FROM ingest_outbox WHERE processed_at < UTC_TIMESTAMP() - INTERVAL 1 DAY");
    const [runs] = await pool.query(
      "DELETE FROM sync_run WHERE started_at < UTC_TIMESTAMP() - INTERVAL 2 DAY");
    return { updated: outbox.affectedRows + runs.affectedRows, message: `deleted ${outbox.affectedRows} outbox, ${runs.affectedRows} runs` };
  })), 60000);

  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log(`\n[${time()}] stopping...`);
    for (const t of timers) clearTimeout(t);
    await closePool();
    await closeMongo();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(async (error) => {
  console.error("Worker could not start:", error.message);
  await closePool();
  await closeMongo();
  process.exit(1);
});
