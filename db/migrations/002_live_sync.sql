-- GCode: live synchronization additions (run after schema.sql)
--
--   npm run db:migrate
--
-- Safe to run more than once: every statement is IF NOT EXISTS / OR REPLACE / IGNORE.
--
-- What it adds
--   1. TESTING verdict, so in-queue submissions are stored and later UPDATEd to their final verdict
--   2. trg_submission_verdict_change: keeps city_daily_stats.accepted_submissions right when a verdict changes
--   3. ingest_outbox: raw Codeforces JSON waiting to be copied into MongoDB (outbox pattern)
--   4. sync_run: one row per background job run, read by the admin dashboard
--   5. geocode_cache: city/country text we already asked the geocoder about (hit or miss)
--   6. sp_resolve_account_locations: links UNRESOLVED accounts to cities through city_alias
--   7. v_city_summary / v_city_tag_counts now skip TESTING, matching the MongoDB analytics

-- ---------------------------------------------------------------- 1. TESTING verdict
INSERT IGNORE INTO verdict (code, is_accepted) VALUES ('TESTING', FALSE);

-- ---------------------------------------------------------------- 3. outbox (MySQL -> MongoDB)
-- The poller writes the raw API JSON here in the same transaction as the relational rows,
-- so MySQL and the outbox can never disagree. outbox-to-mongo.js copies pending rows into
-- MongoDB (upsert by id) and stamps processed_at.
CREATE TABLE IF NOT EXISTS ingest_outbox (
  outbox_id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  kind         ENUM('submission','user','problem') NOT NULL,
  external_key VARCHAR(64) NOT NULL,               -- submission id, handle or problem key
  payload      JSON NOT NULL,                      -- exactly what Codeforces returned
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3) NULL,                   -- NULL = not yet in MongoDB
  KEY idx_outbox_pending (processed_at, outbox_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- 4. job log for the dashboard
CREATE TABLE IF NOT EXISTS sync_run (
  run_id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  job         ENUM('poll','mongo','analytics','geocode','cleanup') NOT NULL,
  started_at  DATETIME(3) NOT NULL,
  finished_at DATETIME(3) NOT NULL,
  status      ENUM('OK','FAILED') NOT NULL,
  fetched     INT NOT NULL DEFAULT 0,
  inserted    INT NOT NULL DEFAULT 0,
  updated     INT NOT NULL DEFAULT 0,
  message     VARCHAR(500) NULL,
  KEY idx_run_job_time (job, started_at),
  KEY idx_run_time (started_at),
  CONSTRAINT chk_run_counts CHECK (fetched >= 0 AND inserted >= 0 AND updated >= 0),
  CONSTRAINT chk_run_time   CHECK (finished_at >= started_at)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- 5. geocoder cache
-- Nominatim allows one request per second, so never ask about the same text twice.
CREATE TABLE IF NOT EXISTS geocode_cache (
  raw_city     VARCHAR(150) NOT NULL,
  raw_country  VARCHAR(100) NOT NULL,
  city_id      INT NULL,                           -- NULL = geocoder found nothing
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (raw_city, raw_country),
  CONSTRAINT fk_geocache_city FOREIGN KEY (city_id) REFERENCES city(city_id) ON DELETE SET NULL
) ENGINE=InnoDB;

DELIMITER $$

-- ---------------------------------------------------------------- 2. verdict lifecycle trigger
-- TESTING -> OK adds 1 to accepted_submissions, OK -> WRONG_ANSWER removes 1,
-- and total_submissions never changes on UPDATE (the row was already counted on INSERT).
DROP TRIGGER IF EXISTS trg_submission_verdict_change$$
CREATE TRIGGER trg_submission_verdict_change AFTER UPDATE ON submission
FOR EACH ROW
BEGIN
  DECLARE acct_city INT;
  DECLARE old_acc BOOLEAN;
  DECLARE new_acc BOOLEAN;

  IF OLD.verdict_id <> NEW.verdict_id THEN
    SELECT city_id INTO acct_city FROM platform_account WHERE account_id = NEW.account_id;
    SELECT is_accepted INTO old_acc FROM verdict WHERE verdict_id = OLD.verdict_id;
    SELECT is_accepted INTO new_acc FROM verdict WHERE verdict_id = NEW.verdict_id;

    IF acct_city IS NOT NULL AND old_acc <> new_acc THEN
      UPDATE city_daily_stats
         SET accepted_submissions = accepted_submissions + IF(new_acc, 1, -1)
       WHERE city_id = acct_city AND stat_date = DATE(NEW.submitted_at);
    END IF;
  END IF;
END$$

-- ---------------------------------------------------------------- 6. location resolver
-- After the geocoder adds new city_alias rows, attach every UNRESOLVED account whose
-- raw text now matches. Returns the number of accounts it resolved.
DROP PROCEDURE IF EXISTS sp_resolve_account_locations$$
CREATE PROCEDURE sp_resolve_account_locations(OUT resolved INT)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  UPDATE platform_account a
  JOIN country co    ON co.name = a.raw_country
  JOIN city_alias al ON al.raw_text = a.raw_city AND al.country_id = co.country_id
  JOIN city c        ON c.city_id = al.city_id AND c.country_id = co.country_id
     SET a.city_id = c.city_id,
         a.country_id = c.country_id,
         a.location_status = 'CITY_RESOLVED'
   WHERE a.location_status = 'UNRESOLVED';
  SET resolved = ROW_COUNT();
  COMMIT;
END$$

DELIMITER ;

-- ---------------------------------------------------------------- 7. views without TESTING
CREATE OR REPLACE VIEW v_city_summary AS
SELECT c.city_id, c.name AS city, co.name AS country, c.latitude, c.longitude,
       COUNT(s.submission_id)                          AS submissions,
       COUNT(DISTINCT s.account_id)                    AS users,
       ROUND(100 * SUM(v.is_accepted) / COUNT(*), 0)   AS accepted_pct
FROM city c
JOIN country co          ON co.country_id = c.country_id
JOIN platform_account a  ON a.city_id = c.city_id
JOIN submission s        ON s.account_id = a.account_id
JOIN verdict v           ON v.verdict_id = s.verdict_id
WHERE v.code <> 'TESTING'
GROUP BY c.city_id, c.name, co.name, c.latitude, c.longitude;

CREATE OR REPLACE VIEW v_city_tag_counts AS
SELECT a.city_id, t.name AS tag, COUNT(*) AS submissions
FROM platform_account a
JOIN submission s   ON s.account_id = a.account_id
JOIN verdict v      ON v.verdict_id = s.verdict_id
JOIN problem_tag pt ON pt.problem_id = s.problem_id
JOIN tag t          ON t.tag_id = pt.tag_id
WHERE a.city_id IS NOT NULL AND v.code <> 'TESTING'
GROUP BY a.city_id, t.name;
