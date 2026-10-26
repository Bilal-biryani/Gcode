// POST /api/auth/login   body: { username, password }
//
// TODO (backend): real authentication. Right now ANY password works
// and the username "admin" gets the admin role. That is only for building the UI.
//   1. Look the user up in an app-users table (not the Codeforces users table).
//   2. Store passwords hashed (e.g. bcrypt), never as plain text.
//   3. Compare the hash, then return the user's role.
//   4. Later: set a session cookie or JWT so other API routes can check the role.
//
// Response shape:
//   200 { username, role: "admin" | "viewer" }
//   401 { error }

export async function POST(request) {
  const { username, password } = await request.json();

  if (!username || !password) {
    return Response.json({ error: "Username and password are required" }, { status: 400 });
  }

  const role = username === "admin" ? "admin" : "viewer";
  return Response.json({ username, role });
}
