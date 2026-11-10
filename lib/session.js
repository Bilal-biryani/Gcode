// Server-side login session: a signed, httpOnly cookie that carries { id, email, role }.
//
// The cookie is signed with HMAC-SHA256 using AUTH_SECRET, so the browser cannot change
// its role (unlike the old localStorage value). Only API routes and server code import this.

import crypto from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "gcode-session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

// app_user.role (database) -> role name used by the UI and the API guards
const ROLE_FROM_DB = { ADMIN: "admin", USER: "viewer" };
export const roleFromDb = (dbRole) => ROLE_FROM_DB[dbRole] ?? "viewer";

function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
  return "gcode-dev-secret-change-me"; // dev only
}

const sign = (data) => crypto.createHmac("sha256", secret()).update(data).digest("base64url");

export function createToken(user) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...user, exp })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, signature] = token.split(".");
  const given = Buffer.from(signature);
  const expected = Buffer.from(sign(payload));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return data.exp > Math.floor(Date.now() / 1000) ? data : null;
  } catch {
    return null;
  }
}

export async function getSession() {
  const jar = await cookies();
  return verifyToken(jar.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(user) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, createToken(user), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

// Use at the top of a protected API route:
//   const { error } = await requireRole("admin");
//   if (error) return error;
export async function requireRole(role) {
  const session = await getSession();
  if (!session) return { error: Response.json({ error: "Please log in." }, { status: 401 }) };
  if (session.role !== role) return { error: Response.json({ error: "Not allowed for your role." }, { status: 403 }) };
  return { session };
}
