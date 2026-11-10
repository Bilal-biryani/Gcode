// MySQL connection pool, shared by the API routes and the sync scripts.
// Credentials come from .env.local (DB_* names, MYSQL_* also accepted).

import mysql from "mysql2/promise";

export function mysqlConfig() {
  const env = process.env;
  return {
    host: env.DB_HOST ?? env.MYSQL_HOST ?? "localhost",
    port: Number(env.DB_PORT ?? env.MYSQL_PORT ?? 3306),
    user: env.DB_USER ?? env.MYSQL_USER ?? "root",
    password: env.DB_PASSWORD ?? env.MYSQL_PASSWORD ?? "",
    database: env.DB_NAME ?? env.MYSQL_DATABASE ?? "gcode",
    timezone: "Z",          // JS Dates <-> DATETIME as UTC
    dateStrings: false,
  };
}

// Next.js reloads modules in dev mode; keep one pool per MySQL user on globalThis.
function makePool(key, overrides = {}) {
  if (!globalThis[key]) {
    const pool = mysql.createPool({ ...mysqlConfig(), ...overrides, waitForConnections: true, connectionLimit: 5 });
    // schema.sql: DATE(submitted_at) must bucket in UTC
    pool.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));
    globalThis[key] = pool;
  }
  return globalThis[key];
}

const POOL_KEYS = ["__gcodeMysqlPool", "__gcodeViewerPool", "__gcodeAdminPool"];

// Full-access pool: the worker, the login route (reads app_user) and the sync scripts.
export function getPool() {
  return makePool("__gcodeMysqlPool");
}

// Role-based database access (db/migrations/003_roles.sql).
// Public read-only routes connect as gcode_viewer (SELECT only); the admin routes connect
// as gcode_admin. If DB_VIEWER_USER / DB_ADMIN_USER are not set, both fall back to getPool().
export function getViewerPool() {
  const user = process.env.DB_VIEWER_USER;
  if (!user) return getPool();
  return makePool("__gcodeViewerPool", { user, password: process.env.DB_VIEWER_PASSWORD ?? "" });
}

export function getAdminPool() {
  const user = process.env.DB_ADMIN_USER;
  if (!user) return getPool();
  return makePool("__gcodeAdminPool", { user, password: process.env.DB_ADMIN_PASSWORD ?? "" });
}

export async function closePool() {
  for (const key of POOL_KEYS) {
    if (globalThis[key]) {
      await globalThis[key].end();
      globalThis[key] = undefined;
    }
  }
}
