// GET /api/admin/stats
// Live numbers for the admin dashboard: database totals, worker health, recent job runs.
//
// Admins only: the session cookie is checked here, and the queries run as the
// gcode_admin MySQL user (see db/migrations/003_roles.sql).

import { getAdminPool } from "@/lib/db/mysql";
import { getMongoDb } from "@/lib/db/mongodb";
import { dbError } from "@/lib/api";
import { requireRole } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireRole("admin");
  if (error) return error;

  try {
    const pool = getAdminPool();

    const [[totals]] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM submission)                                        AS totalSubmissions,
        (SELECT COUNT(*) FROM platform_account)                                  AS totalUsers,
        (SELECT COUNT(*) FROM problem)                                           AS totalProblems,
        (SELECT COUNT(*) FROM platform_account WHERE city_id IS NULL)            AS usersWithoutCity,
        (SELECT COUNT(*) FROM submission s JOIN verdict v USING (verdict_id)
          WHERE v.code = 'TESTING')                                              AS testing,
        (SELECT COUNT(*) FROM submission
          WHERE submitted_at >= UTC_TIMESTAMP() - INTERVAL 5 MINUTE)             AS lastFiveMinutes,
        (SELECT COUNT(*) FROM ingest_outbox WHERE processed_at IS NULL)          AS outboxPending`);

    // latest successful run of each job: how fresh is each stage of the pipeline?
    const [lastRuns] = await pool.query(`
      SELECT r.job, r.finished_at AS finishedAt, r.message
      FROM sync_run r
      JOIN (SELECT job, MAX(run_id) AS run_id FROM sync_run WHERE status = 'OK' GROUP BY job) latest
        ON latest.run_id = r.run_id`);

    const [syncLog] = await pool.query(`
      SELECT run_id AS id, job, started_at AS startedAt,
             TIMESTAMPDIFF(MICROSECOND, started_at, finished_at) DIV 1000 AS ms,
             fetched, inserted, updated, status, message
      FROM sync_run
      ORDER BY run_id DESC
      LIMIT 15`);

    let cities = null;
    try {
      cities = await (await getMongoDb()).collection("city_analytics").countDocuments();
    } catch {
      // MongoDB down: the dashboard still shows the MySQL side
    }

    const n = (v) => Number(v);
    return Response.json({
      totalSubmissions: n(totals.totalSubmissions),
      totalUsers: n(totals.totalUsers),
      totalProblems: n(totals.totalProblems),
      usersWithoutLocation: totals.totalUsers
        ? Math.round((100 * n(totals.usersWithoutCity)) / n(totals.totalUsers)) : 0,
      testing: n(totals.testing),
      lastFiveMinutes: n(totals.lastFiveMinutes),
      outboxPending: n(totals.outboxPending),
      cities,
      lastRun: Object.fromEntries(lastRuns.map((r) => [r.job, { finishedAt: r.finishedAt, message: r.message }])),
      syncLog: syncLog.map((r) => ({ ...r, ms: n(r.ms) })),
    });
  } catch (error) {
    return dbError(error, "dashboard");
  }
}
