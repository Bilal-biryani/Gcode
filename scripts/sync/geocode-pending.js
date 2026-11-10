// Resolves cities for accounts the poller marked UNRESOLVED (city text with no matching city_alias).
//
//   node scripts/sync/geocode-pending.js      # one round, then exit
//   (the worker runs this every 5 minutes)
//
// Only asks Nominatim about city/country text that is not in geocode_cache yet, at most
// LIMIT per round and one request per second, as their usage policy requires.
// Then sp_resolve_account_locations() attaches the accounts and sp_rebuild_city_stats()
// recounts city_daily_stats, because the insert trigger could not count them at the time.

import "../env.js";
import { geocodeCity } from "../codeforces/geocode-cities.js";
import { getPool, closePool } from "../../lib/db/mysql.js";
import { isMain, runJob } from "./run-job.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function geocodePendingOnce(pool, { limit = 10 } = {}) {
  const [pending] = await pool.query(
    `SELECT DISTINCT a.raw_city, a.raw_country
       FROM platform_account a
       LEFT JOIN geocode_cache g ON g.raw_city = a.raw_city AND g.raw_country = a.raw_country
      WHERE a.location_status = 'UNRESOLVED'
        AND a.raw_city IS NOT NULL AND a.raw_country IS NOT NULL
        AND g.raw_city IS NULL
      LIMIT ?`,
    [limit]
  );

  let found = 0;
  for (const [i, { raw_city: city, raw_country: country }] of pending.entries()) {
    if (i > 0) await sleep(1100);

    let place = null;
    try {
      place = await geocodeCity(city, country);
    } catch (error) {
      console.error(`[geocode] ${city}, ${country}: ${error.message}`);
      continue;                       // not cached, so it is retried next round
    }

    const db = await pool.getConnection();
    try {
      await db.beginTransaction();
      let cityId = null;
      if (place) {
        await db.execute("INSERT IGNORE INTO country (name) VALUES (?)", [country]);
        const [[c]] = await db.execute("SELECT country_id FROM country WHERE name = ?", [country]);
        await db.execute(
          `INSERT INTO city (country_id, name, latitude, longitude) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE city_id = LAST_INSERT_ID(city_id)`,
          [c.country_id, city, place.latitude, place.longitude]
        );
        const [[row]] = await db.query("SELECT LAST_INSERT_ID() AS id");
        cityId = row.id;
        await db.execute(
          "INSERT IGNORE INTO city_alias (raw_text, country_id, city_id) VALUES (?, ?, ?)",
          [city, c.country_id, cityId]
        );
        found++;
      }
      await db.execute(
        "INSERT INTO geocode_cache (raw_city, raw_country, city_id) VALUES (?, ?, ?)",
        [city, country, cityId]
      );
      await db.commit();
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }

  // attach accounts to the new cities, then recount the daily rollup if anything moved
  const db = await pool.getConnection();
  let resolved = 0;
  try {
    await db.query("CALL sp_resolve_account_locations(@resolved)");
    const [[row]] = await db.query("SELECT @resolved AS resolved");
    resolved = Number(row.resolved) || 0;
    if (resolved > 0) await db.query("CALL sp_rebuild_city_stats()");
  } finally {
    db.release();
  }

  return {
    fetched: pending.length,
    inserted: found,
    updated: resolved,
    message: pending.length ? `${found}/${pending.length} places found, ${resolved} accounts resolved` : null,
  };
}

// ---------------------------------------------------------------- run directly
if (isMain(import.meta.url)) {
  const pool = getPool();
  console.log(await runJob(pool, "geocode", () => geocodePendingOnce(pool), { logIdle: true }));
  await closePool();
}
