// GET /api/tags
// Returns every tag name, for the filter dropdown on the Problems page.
//
// TODO (backend): SELECT the tag names from your tags table.
//
// Response shape:
//   [string]

import { tags } from "@/lib/mockData";

export async function GET() {
  return Response.json(tags);
}
