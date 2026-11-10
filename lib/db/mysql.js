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

// Next.js reloads modules in dev mode; keep one pool on globalThis instead of one per reload.
export function getPool() {
  if (!globalThis.__gcodeMysqlPool) {
    const pool = mysql.createPool({ ...mysqlConfig(), waitForConnections: true, connectionLimit: 5 });
    // schema.sql: DATE(submitted_at) must bucket in UTC
    pool.pool.on("connection", (conn) => conn.query("SET time_zone = '+00:00'"));
    globalThis.__gcodeMysqlPool = pool;
  }
  return globalThis.__gcodeMysqlPool;
}

export async function closePool() {
  if (globalThis.__gcodeMysqlPool) {
    await globalThis.__gcodeMysqlPool.end();
    globalThis.__gcodeMysqlPool = undefined;
  }
}
