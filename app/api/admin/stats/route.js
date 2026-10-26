// GET /api/admin/stats
// Numbers for the admin dashboard.
//
// TODO (backend):
//   - totals: COUNT(*) on submissions / users / problems
//   - syncLog: rows from a sync-log table (or MongoDB collection) that the
//     sync route writes to every time it runs
//   - Only admins should get this. Check the logged-in user's role first.
//
// Response shape:
//   { totalSubmissions, totalUsers, totalProblems, usersWithoutLocation, lastSync,
//     syncLog: [{ id, startedAt, fetched, inserted, status }] }

import { adminStats } from "@/lib/mockData";

export async function GET() {
  return Response.json(adminStats);
}
