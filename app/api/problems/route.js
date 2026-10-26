// GET /api/problems?search=&tag=&minRating=&maxRating=
// Returns the list on the Problems page.
//
// TODO (backend): do the filtering in SQL instead of in JavaScript.
//   - search    -> WHERE name LIKE ?   (or a FULLTEXT index)
//   - tag       -> JOIN with the problem-tag table
//   - min/max   -> WHERE rating BETWEEN ? AND ?
//   Always pass user input as query parameters (the ? placeholders),
//   never by gluing strings together. That is how SQL injection happens.
//
// Response shape:
//   [{ id, name, rating, tags: [string], solvedCount }]

import { problems } from "@/lib/mockData";

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const search = (params.get("search") || "").toLowerCase();
  const tag = params.get("tag") || "";
  const minRating = Number(params.get("minRating") || 0);
  const maxRating = Number(params.get("maxRating") || 4000);

  const result = problems.filter(
    (p) =>
      p.name.toLowerCase().includes(search) &&
      (!tag || p.tags.includes(tag)) &&
      (p.rating ?? 0) >= minRating &&
      (p.rating ?? 0) <= maxRating
  );

  return Response.json(result);
}
