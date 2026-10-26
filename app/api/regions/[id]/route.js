// GET /api/regions/:id
// Returns the details shown in the side panel when a dot is clicked.
//
// TODO (backend): replace the mock with real queries for this one region.
//   - topTags:     which tags are most common in this region's submissions
//   - verdicts:    how many OK / WRONG_ANSWER / ... in this region
//   - topProblems: problems solved most often in this region
//   (Good candidate for a MongoDB aggregation, or a stored procedure in MySQL.)
//
// Response shape:
//   { id, city, country, lat, lng, submissions, users, solved,
//     topTags: [{ name, count }],
//     verdicts: [{ name, count }],
//     topProblems: [{ id, name, rating, tags, solvedCount }] }

import { regionDetail } from "@/lib/mockData";

export async function GET(request, { params }) {
  const { id } = await params;
  const detail = regionDetail(id);

  if (!detail) {
    return Response.json({ error: "Region not found" }, { status: 404 });
  }
  return Response.json(detail);
}
