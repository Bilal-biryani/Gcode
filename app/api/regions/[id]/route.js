// GET /api/regions/:id
// The side panel for one city: the whole precomputed city_analytics document (MongoDB).

import { getMongoDb } from "@/lib/db/mongodb";
import { dbError, toRegion } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  const { id } = await params;
  const cityId = Number(id);
  if (!Number.isInteger(cityId)) {
    return Response.json({ error: "Invalid city id" }, { status: 400 });
  }

  try {
    const db = await getMongoDb();
    const doc = await db.collection("city_analytics").findOne({ cityId }, { projection: { _id: 0 } });
    if (!doc) {
      return Response.json({ error: "City not found" }, { status: 404 });
    }

    return Response.json({
      ...toRegion(doc),
      topTags: (doc.topics ?? []).map((t) => ({ name: t.tag, count: t.count })),
      verdicts: (doc.verdicts ?? []).map((v) => ({ name: v.code, count: v.count })),
      languages: doc.languages ?? [],
      difficulty: (doc.difficulty ?? []).map((d) => ({ name: d.band, count: d.count })),
      topProblems: (doc.mostSolved ?? []).map((p) => ({
        id: p.key, name: p.name, rating: p.rating ?? null, solvedCount: p.solvers,
      })),
    });
  } catch (error) {
    return dbError(error, "city");
  }
}
