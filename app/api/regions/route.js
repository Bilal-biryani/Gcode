// GET /api/regions
// Every dot on the globe: one city_analytics document per city (MongoDB).
// The worker rebuilds these every 5 minutes, so this is a cheap indexed read.

import { getMongoDb } from "@/lib/db/mongodb";
import { dbError, toRegion } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getMongoDb();
    const docs = await db.collection("city_analytics")
      .find({}, { projection: { _id: 0, cityId: 1, city: 1, country: 1, lat: 1, lng: 1, totals: 1, updatedAt: 1 } })
      .sort({ "totals.submissions": -1 })
      .toArray();
    return Response.json(docs.map(toRegion));
  } catch (error) {
    return dbError(error, "regions");
  }
}
