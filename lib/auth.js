// Frontend-only login state, kept in the browser's localStorage.
//
// This is NOT security. Anyone can open DevTools and set role = "admin".
// It only decides what the UI shows. The real check must happen in the
// API routes (backend), once real login with sessions/JWT is built.

const KEY = "gcode-user";

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export function saveUser(user) {
  localStorage.setItem(KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("gcode-auth"));
}

export function logout() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("gcode-auth"));
}
