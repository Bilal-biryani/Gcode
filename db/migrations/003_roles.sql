-- GCode: role-based access control inside MySQL (run after schema.sql and 002_live_sync.sql)
--
--   mysql -u root -p gcode < db/migrations/003_roles.sql
--
-- Two roles, enforced by the database itself (not only by the app):
--   gcode_viewer  SELECT only, on the tables and views the public pages read
--   gcode_admin   SELECT everywhere + write access only to the sync tables the dashboard uses
--
-- The Next.js app connects as gcode_viewer for public routes (/api/problems, /api/tags) and as
-- gcode_admin for /api/admin/*. So even if a bug let a viewer reach a write query, MySQL would
-- refuse it. The worker and the login route keep using the main DB_USER account.
--
-- BEFORE RUNNING: change the two passwords below, then put the same values in .env.local
-- (DB_VIEWER_USER / DB_VIEWER_PASSWORD and DB_ADMIN_USER / DB_ADMIN_PASSWORD).
-- Safe to run more than once.

-- ---------------------------------------------------------------- roles
CREATE ROLE IF NOT EXISTS 'gcode_viewer', 'gcode_admin';

-- viewer: read-only, and no access to app_user (password hashes) or the sync tables
GRANT SELECT ON gcode.problem          TO 'gcode_viewer';
GRANT SELECT ON gcode.problem_tag      TO 'gcode_viewer';
GRANT SELECT ON gcode.tag              TO 'gcode_viewer';
GRANT SELECT ON gcode.submission       TO 'gcode_viewer';
GRANT SELECT ON gcode.verdict          TO 'gcode_viewer';
GRANT SELECT ON gcode.platform         TO 'gcode_viewer';
GRANT SELECT ON gcode.country          TO 'gcode_viewer';
GRANT SELECT ON gcode.city             TO 'gcode_viewer';
GRANT SELECT ON gcode.city_daily_stats TO 'gcode_viewer';
GRANT SELECT ON gcode.v_city_summary    TO 'gcode_viewer';
GRANT SELECT ON gcode.v_city_tag_counts TO 'gcode_viewer';

-- admin: read everything, write only what the dashboard's sync and job log need
GRANT SELECT ON gcode.*                TO 'gcode_admin';
GRANT INSERT ON gcode.sync_run         TO 'gcode_admin';
GRANT INSERT, UPDATE ON gcode.ingest_outbox TO 'gcode_admin';

-- ---------------------------------------------------------------- accounts that use the roles
-- (CHANGE THESE PASSWORDS)
CREATE USER IF NOT EXISTS 'gcode_viewer_user'@'localhost' IDENTIFIED BY 'change-me-viewer';
CREATE USER IF NOT EXISTS 'gcode_admin_user'@'localhost'  IDENTIFIED BY 'change-me-admin';

GRANT 'gcode_viewer' TO 'gcode_viewer_user'@'localhost';
GRANT 'gcode_admin'  TO 'gcode_admin_user'@'localhost';

-- a role only applies to a connection if it is a default role of the account
SET DEFAULT ROLE 'gcode_viewer' TO 'gcode_viewer_user'@'localhost';
SET DEFAULT ROLE 'gcode_admin'  TO 'gcode_admin_user'@'localhost';

-- ---------------------------------------------------------------- demo / viva checks
-- Run these while connected as each account (mysql -u gcode_viewer_user -p gcode):
--
--   as gcode_viewer_user:
--     SELECT COUNT(*) FROM problem;                         -- works
--     SELECT * FROM app_user;                               -- ERROR 1142: SELECT command denied
--     INSERT INTO tag (name) VALUES ('hacked');             -- ERROR 1142: INSERT command denied
--     DELETE FROM submission;                               -- ERROR 1142: DELETE command denied
--
--   as gcode_admin_user:
--     SELECT COUNT(*) FROM sync_run;                        -- works
--     INSERT INTO sync_run (job, started_at, finished_at, status)
--       VALUES ('cleanup', NOW(), NOW(), 'OK');             -- works
--     DELETE FROM submission;                               -- ERROR 1142: DELETE command denied
--
--   SHOW GRANTS FOR 'gcode_viewer_user'@'localhost' USING 'gcode_viewer';
--   SHOW GRANTS FOR 'gcode_admin_user'@'localhost'  USING 'gcode_admin';
