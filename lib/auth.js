// Client-side helpers for the login state.
//
// The real login lives in a signed httpOnly cookie that the browser cannot read or edit.
// These helpers only ask the server who is logged in (/api/auth/me) so the UI can show or
// hide things. Every protected API route checks the cookie again on the server
// (see lib/session.js), so changing anything in DevTools does not grant access.

export async function fetchUser() {
  try {
    const res = await fetch("/api/auth/me", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).user ?? null;
  } catch {
    return null;
  }
}

// tell the navbar (and anything else listening) to re-check who is logged in
export function notifyAuthChange() {
  window.dispatchEvent(new Event("gcode-auth"));
}

export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    notifyAuthChange();
  }
}
