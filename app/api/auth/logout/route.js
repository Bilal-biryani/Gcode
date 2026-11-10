// POST /api/auth/logout: clears the session cookie.

import { clearSessionCookie } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  await clearSessionCookie();
  return Response.json({ ok: true });
}
