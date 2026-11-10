// GET /api/problems?search=&tag=&minRating=&maxRating=
// Problems table (MySQL). Uses the FULLTEXT index on problem.name for searches of 3+ letters,
// and a CTE to count distinct accepted solvers per problem.

import { getPool } from "@/lib/db/mysql";
import { dbError } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const search = (params.get("search") || "").trim();
  const tag = params.get("tag") || "";
  const minRating = params.get("minRating");
  const maxRating = params.get("maxRating");

  const where = [];
  const values = [];

  // InnoDB FULLTEXT ignores words under 3 letters, so those fall back to LIKE
  const terms = search.replace(/[+\-<>()~*"@]/g, " ").split(/\s+/).filter((t) => t.length >= 3);
  if (terms.length) {
    // boolean mode with prefix match: "watermel" finds "Watermelon"
    where.push("MATCH(p.name) AGAINST (? IN BOOLEAN MODE)");
    values.push(terms.map((t) => `+${t}*`).join(" "));
  } else if (search) {
    where.push("p.name LIKE ?");
    values.push(`%${search}%`);
  }
  if (tag) {
    where.push(`EXISTS (SELECT 1 FROM problem_tag pt2 JOIN tag t2 ON t2.tag_id = pt2.tag_id
                         WHERE pt2.problem_id = p.problem_id AND t2.name = ?)`);
    values.push(tag);
  }
  if (minRating) {
    where.push("p.rating >= ?");
    values.push(Number(minRating));
  }
  if (maxRating) {
    where.push("p.rating <= ?");
    values.push(Number(maxRating));
  }

  // user input only ever goes in through the ? placeholders
  const sql = `
    WITH solved AS (
      SELECT s.problem_id, COUNT(DISTINCT s.account_id) AS solvers
      FROM submission s
      JOIN verdict v ON v.verdict_id = s.verdict_id AND v.is_accepted
      GROUP BY s.problem_id
    )
    SELECT p.external_key AS id, p.name, p.rating,
           COALESCE(sv.solvers, 0) AS solvedCount,
           GROUP_CONCAT(t.name ORDER BY t.name SEPARATOR '|') AS tags
    FROM problem p
    LEFT JOIN solved sv      ON sv.problem_id = p.problem_id
    LEFT JOIN problem_tag pt ON pt.problem_id = p.problem_id
    LEFT JOIN tag t          ON t.tag_id = pt.tag_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY p.problem_id, p.external_key, p.name, p.rating, sv.solvers
    ORDER BY solvedCount DESC, p.problem_id DESC
    LIMIT 100`;

  try {
    const [rows] = await getPool().query(sql, values);
    return Response.json(rows.map((r) => ({
      ...r,
      solvedCount: Number(r.solvedCount),
      tags: r.tags ? r.tags.split("|") : [],
    })));
  } catch (error) {
    return dbError(error, "problems");
  }
}
