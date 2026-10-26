// POST /api/admin/sync
// The "Sync from Codeforces" button on the admin page calls this.
//
// TODO (backend): move the Codeforces collector script logic in here.
//   1. Fetch recent submissions + user info from the Codeforces API.
//   2. Save the raw JSON response in MongoDB (shape can change, so NoSQL fits).
//   3. Insert the cleaned rows into MySQL inside a TRANSACTION, so a
//      failure half-way does not leave half a batch behind.
//   4. Write a row to the sync log and return the counts.
//   Only admins should be allowed to call this.
//
// Response shape:
//   { fetched, inserted, status }

export async function POST() {
  return Response.json(
    { error: "Not implemented yet. This is your job!" },
    { status: 501 }
  );
}
