// Runs one background job and records it in sync_run for the admin dashboard.

import { pathToFileURL } from "node:url";

// true when the file was started with `node file.js` rather than imported
export const isMain = (importMetaUrl) =>
  Boolean(process.argv[1]) && importMetaUrl === pathToFileURL(process.argv[1]).href;

export async function runJob(pool, job, fn, { logIdle = false } = {}) {
  const startedAt = new Date();
  let result = { fetched: 0, inserted: 0, updated: 0, message: null };
  let status = "OK";

  try {
    result = { ...result, ...(await fn()) };
  } catch (error) {
    status = "FAILED";
    result.message = error.message;
    console.error(`[${job}] failed:`, error.message);
  }

  const changed = result.inserted + result.updated > 0;
  // Polls run every few seconds: only log the ones that changed something (or failed)
  if (status === "FAILED" || changed || logIdle) {
    try {
      await pool.execute(
        `INSERT INTO sync_run (job, started_at, finished_at, status, fetched, inserted, updated, message)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [job, startedAt, new Date(), status, result.fetched, result.inserted, result.updated,
         result.message?.slice(0, 500) ?? null]
      );
    } catch (error) {
      console.error(`[${job}] could not write sync_run:`, error.message);
    }
  }

  return { ...result, status };
}
