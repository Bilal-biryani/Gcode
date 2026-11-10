// GET /api/auth/me: who is logged in? { user: { username, email, role } | null }
// The navbar and the admin page use this instead of trusting anything stored in the browser.

import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  return Response.json({
    user: session ? { username: session.username, email: session.email, role: session.role } : null,
  });
}
