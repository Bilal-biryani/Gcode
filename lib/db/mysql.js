// MySQL connection, used by the API routes.
//
// TODO:
//   1. npm install mysql2
//   2. Create a connection POOL (not a single connection) using the values
//      from .env.local: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE
//      Read them with process.env.MYSQL_HOST etc. Never type the password here.
//   3. Export the pool, then in a route:  import pool from "@/lib/db/mysql";
//
// Tip: Next.js reloads files in dev mode, which can open a new pool on every
// save. Search "mysql2 pool next.js global" to see how people avoid that.
