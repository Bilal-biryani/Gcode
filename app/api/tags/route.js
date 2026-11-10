// GET /api/tags
// Every tag name, for the filter dropdown on the Problems page (MySQL).

import { getViewerPool } from "@/lib/db/mysql";
import { dbError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [rows] = await getViewerPool().query("SELECT name FROM tag ORDER BY name");
    return Response.json(rows.map((r) => r.name));
  } catch (error) {
    return dbError(error, "tags");
  }
}
