// POST /api/admin/sync
// "Rebuild now" on the admin page: copy pending outbox rows to MongoDB and rebuild
// city_analytics immediately, instead of waiting for the worker's 5-minute cycle.
// (Polling Codeforces stays in the worker, so two processes never share the API rate limit.)
//
// Admins only: the session cookie is checked here, and MySQL work runs as the
// gcode_admin user (see db/migrations/003_roles.sql).

import { getAdminPool } from "@/lib/db/mysql";
import { getMongoDb } from "@/lib/db/mongodb";
import { dbError } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { runJob } from "@/scripts/sync/run-job";
import { syncOutboxOnce } from "@/scripts/sync/outbox-to-mongo";
import analytics from "@/scripts/build-city-analytics.cjs";

export const dynamic = "force-dynamic";

export async function POST() {
  const { error } = await requireRole("admin");
  if (error) return error;

  try {
    const pool = getAdminPool();
    const mongo = await getMongoDb();

    const result = await runJob(pool, "analytics", async () => {
      const copied = await syncOutboxOnce(pool, mongo);
      const b = await analytics.buildCityAnalytics({ my: pool, db: mongo, verify: false, log: () => {} });
      return {
        fetched: b.rawTotal,
        inserted: b.cities,
        updated: copied.inserted,
        message: `manual: ${b.cities} cities from ${b.usable} usable submissions`,
      };
    }, { logIdle: true });

    if (result.status === "FAILED") {
      return Response.json({ error: result.message }, { status: 500 });
    }
    return Response.json(result);
  } catch (error) {
    return dbError(error, "sync");
  }
}
