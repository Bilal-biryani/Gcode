// GET /api/regions
// Returns every dot to draw on the globe.
//
// TODO (backend): replace the mock with a real query.
//   - Which table(s) hold a user's city/country and their submissions?
//   - You need one row per city: city, country, lat, lng, and the counts below.
//   - Hint: GROUP BY + COUNT, or a MySQL VIEW you create once and SELECT from.
//
// Response shape (keep this so the frontend keeps working):
//   [{ id, city, country, lat, lng, submissions, users, solved }]

import { regions } from "@/lib/mockData";

export async function GET() {
  return Response.json(regions);
}
