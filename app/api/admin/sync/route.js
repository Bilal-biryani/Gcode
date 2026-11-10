// POST /api/admin/sync
// "Rebuild now" on the admin page: copy pending outbox rows to MongoDB and rebuild
// city_analytics immediately, instead of waiting for the worker's 5-minute cycle.
// (Polling Codeforces stays in the worker, so two processes never share the API rate limit.)
//
// TODO (auth): only admins should be allowed to call this.

import { getPool } from "@/lib/db/mysql";
import { getMongoDb } from "@/lib/db/mongodb";
import { dbError } from "@/lib/api";
import { runJob } from "@/scripts/sync/run-job";
import { syncOutboxOnce } from "@/scripts/sync/outbox-to-mongo";
import analytics from "@/scripts/build-city-analytics.cjs";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const pool = getPool();
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
