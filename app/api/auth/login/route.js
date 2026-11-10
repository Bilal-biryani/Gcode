// POST /api/auth/login   body: { email, password }
//
// Looks the user up in app_user, compares the bcrypt hash, and sets a signed httpOnly
// session cookie that carries the role. Roles: ADMIN (database) -> "admin", USER -> "viewer".
//
// Response:
//   200 { username, email, role: "admin" | "viewer" }
//   400 { error }   missing fields
//   401 { error }   wrong email or password

import bcrypt from "bcryptjs";
import { getPool } from "@/lib/db/mysql";
import { dbError } from "@/lib/api";
import { roleFromDb, setSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body?.email ?? "").trim();
  const password = String(body?.password ?? "");
  if (!email || !password) {
    return Response.json({ error: "Email and password are required" }, { status: 400 });
  }

  try {
    const [rows] = await getPool().query(
      "SELECT user_id, email, password_hash, role FROM app_user WHERE email = ? LIMIT 1",
      [email]
    );
    const row = rows[0];
    const valid = row ? await bcrypt.compare(password, row.password_hash) : false;
    if (!valid) {
      return Response.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const user = { id: row.user_id, email: row.email, username: row.email, role: roleFromDb(row.role) };
    await setSessionCookie(user);
    return Response.json({ username: user.username, email: user.email, role: user.role });
  } catch (error) {
    return dbError(error, "login");
  }
}
