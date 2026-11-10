-- GCode: MySQL 8.0.16+ schema (CHECK constraints are enforced from 8.0.16)
--
-- Run with the mysql client:   mysql -u root -p < schema.sql
--   (DELIMITER is a client command, so Node drivers such as mysql2 cannot run this file directly)
-- Ingestion code must run   SET time_zone = '+00:00';   so DATE(submitted_at) buckets are UTC
--   (Codeforces sends epoch seconds and FROM_UNIXTIME follows the session time zone).
CREATE DATABASE IF NOT EXISTS gcode CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE gcode;
-- ---------------------------------------------------------------- platforms
CREATE TABLE platform (
  platform_id INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(50) NOT NULL UNIQUE          -- 'Codeforces', 'LeetCode', ...
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- geography
CREATE TABLE country (
  country_id INT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL UNIQUE,
  iso2       CHAR(2) NULL UNIQUE                   -- helps map to globe/geojson
) ENGINE=InnoDB;

CREATE TABLE city (
  city_id    INT AUTO_INCREMENT PRIMARY KEY,
  country_id INT NOT NULL,
  name       VARCHAR(100) NOT NULL,
  latitude   DECIMAL(9,6) NOT NULL,
  longitude  DECIMAL(9,6) NOT NULL,
  UNIQUE KEY uq_city_country_name (country_id, name),   -- 'Hyderabad' in India != Pakistan
  UNIQUE KEY uq_city_country (city_id, country_id),     -- target for composite FK below
  CONSTRAINT fk_city_country FOREIGN KEY (country_id) REFERENCES country(country_id),
  CONSTRAINT chk_city_lat CHECK (latitude  BETWEEN -90  AND 90),
  CONSTRAINT chk_city_lng CHECK (longitude BETWEEN -180 AND 180)
) ENGINE=InnoDB;

-- maps messy profile text ('Bengaluru', 'Bangalore', 'blr') to one canonical city
CREATE TABLE city_alias (
  alias_id    INT AUTO_INCREMENT PRIMARY KEY,
  raw_text    VARCHAR(150) NOT NULL,
  country_id  INT NULL,                                 -- optional disambiguation
  city_id     INT NOT NULL,
  country_key INT AS (IFNULL(country_id, 0)) STORED,    -- makes UNIQUE work with NULL country
  UNIQUE KEY uq_alias (raw_text, country_key),
  CONSTRAINT fk_alias_city    FOREIGN KEY (city_id)    REFERENCES city(city_id) ON DELETE CASCADE,
  CONSTRAINT fk_alias_country FOREIGN KEY (country_id) REFERENCES country(country_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- app users
-- people who log in to GCode (not the same thing as a Codeforces account)
CREATE TABLE app_user (
  user_id       INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('ADMIN','USER') NOT NULL DEFAULT 'USER',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- accounts
CREATE TABLE platform_account (
  account_id      INT AUTO_INCREMENT PRIMARY KEY,
  platform_id     INT NOT NULL,
  app_user_id     INT NULL,                 -- the GCode user who linked this account (one user -> many accounts)
  handle          VARCHAR(64) NOT NULL,
  raw_city        VARCHAR(150) NULL,        -- exactly what the API returned, so we can re-resolve later
  raw_country     VARCHAR(100) NULL,
  city_id         INT NULL,
  country_id      INT NULL,
  location_status ENUM('UNKNOWN','COUNTRY_ONLY','CITY_RESOLVED','UNRESOLVED') NOT NULL DEFAULT 'UNKNOWN',
  rating          INT NULL,
  last_synced_at  DATETIME NULL,
  UNIQUE KEY uq_account (platform_id, handle),
  UNIQUE KEY uq_user_platform (app_user_id, platform_id),  -- a user links at most one account per platform (NULLs repeat freely)
  KEY idx_account_city (city_id),
  KEY idx_account_country (country_id),
  CONSTRAINT fk_account_platform FOREIGN KEY (platform_id) REFERENCES platform(platform_id),
  CONSTRAINT fk_account_user     FOREIGN KEY (app_user_id) REFERENCES app_user(user_id) ON DELETE SET NULL,
  CONSTRAINT fk_account_country  FOREIGN KEY (country_id)  REFERENCES country(country_id),
  -- a city must belong to the account's country (skipped by MySQL when city_id is NULL)
  CONSTRAINT fk_account_city     FOREIGN KEY (city_id, country_id) REFERENCES city(city_id, country_id),
  -- location_status must agree with the id columns (also implies: a city always has a country)
  CONSTRAINT chk_account_status  CHECK (
       (location_status = 'CITY_RESOLVED' AND city_id IS NOT NULL)
    OR (location_status = 'COUNTRY_ONLY' AND city_id IS NULL AND country_id IS NOT NULL)
    OR (location_status = 'UNKNOWN'      AND city_id IS NULL AND country_id IS NULL)
    OR (location_status = 'UNRESOLVED'   AND city_id IS NULL)
  )
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- problems
CREATE TABLE contest (
  contest_id  INT AUTO_INCREMENT PRIMARY KEY,
  platform_id INT NOT NULL,
  external_id VARCHAR(32) NOT NULL,
  name        VARCHAR(255) NULL,            -- NULL until contest.list is loaded: a submission's problem carries only the contest id
  start_time  DATETIME NULL,
  UNIQUE KEY uq_contest (platform_id, external_id),
  CONSTRAINT fk_contest_platform FOREIGN KEY (platform_id) REFERENCES platform(platform_id)
) ENGINE=InnoDB;

CREATE TABLE problem (
  problem_id   INT AUTO_INCREMENT PRIMARY KEY,
  platform_id  INT NOT NULL,
  contest_id   INT NULL,                      -- not every platform has contests
  external_key VARCHAR(32) NOT NULL,          -- e.g. '2060A'
  name         VARCHAR(255) NOT NULL,
  rating       INT NULL,
  UNIQUE KEY uq_problem (platform_id, external_key),
  FULLTEXT KEY ft_problem_name (name),        -- full-text search requirement
  CONSTRAINT fk_problem_platform FOREIGN KEY (platform_id) REFERENCES platform(platform_id),
  CONSTRAINT fk_problem_contest  FOREIGN KEY (contest_id)  REFERENCES contest(contest_id),
  CONSTRAINT chk_problem_rating  CHECK (rating IS NULL OR rating BETWEEN 0 AND 4000)
) ENGINE=InnoDB;

CREATE TABLE tag (
  tag_id INT AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE problem_tag (
  problem_id INT NOT NULL,
  tag_id     INT NOT NULL,
  PRIMARY KEY (problem_id, tag_id),
  KEY idx_pt_tag (tag_id),
  CONSTRAINT fk_pt_problem FOREIGN KEY (problem_id) REFERENCES problem(problem_id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_tag     FOREIGN KEY (tag_id)     REFERENCES tag(tag_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- submissions
-- lookup table instead of ENUM: other platforms add verdicts without ALTER TABLE
CREATE TABLE verdict (
  verdict_id  INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40) NOT NULL UNIQUE,
  is_accepted BOOLEAN NOT NULL DEFAULT FALSE
) ENGINE=InnoDB;

INSERT INTO verdict (code, is_accepted) VALUES
  ('OK', TRUE), ('WRONG_ANSWER', FALSE), ('TIME_LIMIT_EXCEEDED', FALSE),
  ('MEMORY_LIMIT_EXCEEDED', FALSE), ('RUNTIME_ERROR', FALSE), ('COMPILATION_ERROR', FALSE),
  ('IDLENESS_LIMIT_EXCEEDED', FALSE), ('PRESENTATION_ERROR', FALSE),
  ('CHALLENGED', FALSE), ('SKIPPED', FALSE), ('PARTIAL', FALSE), ('REJECTED', FALSE),
  ('FAILED', FALSE), ('CRASHED', FALSE), ('SECURITY_VIOLATED', FALSE), ('INPUT_PREPARATION_CRASHED', FALSE);
-- 'TESTING' is non-final: skip it during ingestion and pick the submission up on the next sync.
-- Ingestion should INSERT IGNORE any verdict code it has not seen, so a new code never breaks the FK.

-- submission.platform_id is a deliberate denormalization (derivable via account -> platform):
-- it lets UNIQUE (platform_id, external_id) enforce idempotent re-ingestion; trg_submission_check keeps it consistent.
CREATE TABLE submission (
  submission_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  platform_id   INT NOT NULL,
  external_id   BIGINT NOT NULL,
  account_id    INT NOT NULL,
  problem_id    INT NOT NULL,
  verdict_id    INT NOT NULL,
  language      VARCHAR(50) NULL,
  submitted_at  DATETIME NOT NULL,            -- UTC
  UNIQUE KEY uq_submission (platform_id, external_id),     -- makes re-ingestion idempotent
  KEY idx_sub_account_time (account_id, submitted_at),
  KEY idx_sub_problem_verdict (problem_id, verdict_id),
  KEY idx_sub_time (submitted_at),
  CONSTRAINT fk_sub_platform FOREIGN KEY (platform_id) REFERENCES platform(platform_id),
  CONSTRAINT fk_sub_account  FOREIGN KEY (account_id)  REFERENCES platform_account(account_id),
  CONSTRAINT fk_sub_problem  FOREIGN KEY (problem_id)  REFERENCES problem(problem_id),
  CONSTRAINT fk_sub_verdict  FOREIGN KEY (verdict_id)  REFERENCES verdict(verdict_id)
) ENGINE=InnoDB;

-- derived table (so it is not in the ER diagram): pre-aggregated counts per city per day
-- feeds the globe + time slider cheaply; kept current by trg_submission_rollup, rebuilt by sp_rebuild_city_stats
CREATE TABLE city_daily_stats (
  city_id              INT NOT NULL,
  stat_date            DATE NOT NULL,
  total_submissions    INT NOT NULL DEFAULT 0,
  accepted_submissions INT NOT NULL DEFAULT 0,
  PRIMARY KEY (city_id, stat_date),
  KEY idx_cds_date (stat_date),
  CONSTRAINT fk_cds_city FOREIGN KEY (city_id) REFERENCES city(city_id) ON DELETE CASCADE,
  CONSTRAINT chk_cds_counts CHECK (accepted_submissions <= total_submissions)
) ENGINE=InnoDB;

CREATE TABLE city_follow (
  user_id     INT NOT NULL,
  city_id     INT NOT NULL,
  followed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, city_id),
  CONSTRAINT fk_cf_user FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_cf_city FOREIGN KEY (city_id) REFERENCES city(city_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------- triggers
DELIMITER $$

-- integrity: submission.platform_id must match its account's platform
CREATE TRIGGER trg_submission_check BEFORE INSERT ON submission
FOR EACH ROW
BEGIN
  DECLARE acct_platform INT;
  SELECT platform_id INTO acct_platform FROM platform_account WHERE account_id = NEW.account_id;
  IF acct_platform <> NEW.platform_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'submission platform does not match account platform';
  END IF;
END$$

-- keep the daily rollup current as submissions arrive
-- (only sees the account's city at insert time: run sp_rebuild_city_stats() after locations are resolved)
CREATE TRIGGER trg_submission_rollup AFTER INSERT ON submission
FOR EACH ROW
BEGIN
  DECLARE acct_city INT;
  DECLARE acc BOOLEAN;
  SELECT city_id INTO acct_city FROM platform_account WHERE account_id = NEW.account_id;
  SELECT is_accepted INTO acc FROM verdict WHERE verdict_id = NEW.verdict_id;
  IF acct_city IS NOT NULL THEN
    INSERT INTO city_daily_stats (city_id, stat_date, total_submissions, accepted_submissions)
    VALUES (acct_city, DATE(NEW.submitted_at), 1, IF(acc, 1, 0))
    ON DUPLICATE KEY UPDATE
      total_submissions    = total_submissions + 1,
      accepted_submissions = accepted_submissions + IF(acc, 1, 0);
  END IF;
END$$

-- ---------------------------------------------------------------- procedures
-- recompute the whole rollup from submissions, all-or-nothing.
-- call it after a batch of city resolutions (new city_alias rows, admin merges, re-resolve job)
CREATE PROCEDURE sp_rebuild_city_stats()
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;
  DELETE FROM city_daily_stats;
  INSERT INTO city_daily_stats (city_id, stat_date, total_submissions, accepted_submissions)
  SELECT a.city_id, DATE(s.submitted_at), COUNT(*), SUM(v.is_accepted)
  FROM submission s
  JOIN platform_account a ON a.account_id = s.account_id
  JOIN verdict v          ON v.verdict_id  = s.verdict_id
  WHERE a.city_id IS NOT NULL
  GROUP BY a.city_id, DATE(s.submitted_at);
  COMMIT;
END$$

DELIMITER ;

-- ---------------------------------------------------------------- views
-- city panel headline stats (submissions, users, accepted %)
CREATE VIEW v_city_summary AS
SELECT c.city_id, c.name AS city, co.name AS country, c.latitude, c.longitude,
       COUNT(s.submission_id)                          AS submissions,
       COUNT(DISTINCT s.account_id)                    AS users,
       ROUND(100 * SUM(v.is_accepted) / COUNT(*), 0)   AS accepted_pct
FROM city c
JOIN country co          ON co.country_id = c.country_id
JOIN platform_account a  ON a.city_id = c.city_id
JOIN submission s        ON s.account_id = a.account_id
JOIN verdict v           ON v.verdict_id = s.verdict_id
GROUP BY c.city_id, c.name, co.name, c.latitude, c.longitude;

-- "top topics" list in the city panel (a submission counts once per tag of its problem)
CREATE VIEW v_city_tag_counts AS
SELECT a.city_id, t.name AS tag, COUNT(*) AS submissions
FROM platform_account a
JOIN submission s   ON s.account_id = a.account_id
JOIN problem_tag pt ON pt.problem_id = s.problem_id
JOIN tag t          ON t.tag_id = pt.tag_id
WHERE a.city_id IS NOT NULL
GROUP BY a.city_id, t.name;
