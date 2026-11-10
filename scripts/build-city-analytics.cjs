#!/usr/bin/env node
'use strict';
/*
 * GCode: MongoDB setup + city_analytics builder
 *
 *   node scripts/build-city-analytics.cjs              # setup + rebuild + verify against MySQL
 *   node scripts/build-city-analytics.cjs --keep-tmp   # keep tmp_city_submissions for inspection
 *   node scripts/build-city-analytics.cjs --no-verify  # skip the MySQL consistency check
 *
 * Needs:  npm i mongodb mysql2 dotenv
 * Env (.env.local): DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 *                    MONGODB_URI (optional; defaults to local MongoDB),
 *                    MONGODB_DB (optional; defaults to gcode).
 * Supports the MYSQL_* variable names too, if already configured.
 *
 * What it does
 *   1. copies the handle -> city mapping and the city coordinates from MySQL into Mongo
 *      (account_city, city_dim), so both databases agree on who lives where
 *   2. creates collections with $jsonSchema validators and indexes
 *   3. enriches raw_submissions (final verdicts only, known city only) into tmp_city_submissions
 *   4. runs one aggregation per panel section and $merge-s each into city_analytics
 *      (one document per city: markers + panel in a single read)
 *   5. compares totals with MySQL v_city_summary
 *
 * The pipelines are exported (see bottom) so they can be tested without a database.
 */

// ------------------------------------------------------------------ config
const TOP = { topics: 6, verdicts: 5, mostSolved: 5, languages: 6 };
const BAND_LABELS = ['<1200', '1200-1599', '1600-1999', '2000-2399', '2400+', 'Unrated'];
const NUM = ['int', 'long', 'double'];

// ------------------------------------------------------------------ pipelines
// language families: Codeforces has dozens of compiler strings ('C++23 (GCC 14-64, msys2)', 'PyPy 3.10 ...')
const LANGUAGE_FAMILY = {
  $switch: {
    branches: [
      { case: { $regexMatch: { input: '$programmingLanguage', regex: 'C\\+\\+|G\\+\\+' } }, then: 'C++' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: 'Python|PyPy' } }, then: 'Python' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: 'JavaScript|Node\\.js' } }, then: 'JavaScript' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: '^Java' } }, then: 'Java' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: 'Kotlin' } }, then: 'Kotlin' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: 'Rust' } }, then: 'Rust' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: '^Go( |$)' } }, then: 'Go' },
      { case: { $regexMatch: { input: '$programmingLanguage', regex: 'C#' } }, then: 'C#' },
    ],
    default: 'Other',
  },
};

const mergeInto = (whenNotMatched) => ({
  $merge: { into: 'city_analytics', on: 'cityId', whenMatched: 'merge', whenNotMatched },
});

/** raw_submissions -> tmp_city_submissions: one flat row per usable submission. */
function enrichPipeline() {
  return [
    // same rule as the MySQL importer: skip missing / non-final verdicts
    { $match: { verdict: { $type: 'string', $ne: 'TESTING' } } },
    {
      $addFields: {
        handleLower: { $toLower: { $ifNull: [{ $arrayElemAt: ['$author.members.handle', 0] }, ''] } },
        key: { $concat: [{ $toString: '$problem.contestId' }, '$problem.index'] },
      },
    },
    // keep only submissions whose author has a resolved city (same as MySQL city panels)
    { $lookup: { from: 'account_city', localField: 'handleLower', foreignField: 'handleLower', as: 'ac' } },
    { $match: { 'ac.0': { $exists: true } } },
    // rating normally lives on the problemset entry, not on the submission's embedded problem
    { $lookup: { from: 'raw_problems', localField: 'key', foreignField: 'key', as: 'pd' } },
    {
      $project: {
        _id: 0,
        submissionId: '$id',
        cityId: { $arrayElemAt: ['$ac.cityId', 0] },
        handle: '$handleLower',
        verdict: 1,
        isAccepted: { $eq: ['$verdict', 'OK'] },
        languageFamily: LANGUAGE_FAMILY,
        key: 1,
        problemName: '$problem.name',
        tags: { $ifNull: ['$problem.tags', []] },
        rating: { $ifNull: ['$problem.rating', { $arrayElemAt: ['$pd.rating', 0] }] },
        submittedAt: { $toDate: { $multiply: ['$creationTimeSeconds', 1000] } },
      },
    },
    {
      $addFields: {
        bandIdx: {
          $switch: {
            branches: [
              { case: { $not: [{ $isNumber: '$rating' }] }, then: 5 },
              { case: { $lt: ['$rating', 1200] }, then: 0 },
              { case: { $lt: ['$rating', 1600] }, then: 1 },
              { case: { $lt: ['$rating', 2000] }, then: 2 },
              { case: { $lt: ['$rating', 2400] }, then: 3 },
            ],
            default: 4,
          },
        },
      },
    },
    { $out: 'tmp_city_submissions' },
  ];
}

// The metric pipelines run on tmp_city_submissions. Each one ends in $merge so every
// section lands in the same city document. (`withoutMerge` strips it for tests.)

/** creates the city document: marker fields (hover tooltip) + headline numbers */
function totalsPipeline(now) {
  return [
    {
      $group: {
        _id: '$cityId',
        submissions: { $sum: 1 },
        accepted: { $sum: { $cond: ['$isAccepted', 1, 0] } },
        users: { $addToSet: '$handle' },
      },
    },
    { $lookup: { from: 'city_dim', localField: '_id', foreignField: 'cityId', as: 'c' } },
    { $unwind: '$c' },
    {
      $project: {
        _id: 0,
        cityId: '$_id',
        city: '$c.city',
        country: '$c.country',
        lat: '$c.lat',
        lng: '$c.lng',
        totals: {
          submissions: '$submissions',
          users: { $size: '$users' },
          accepted: '$accepted',
          // half-up, like MySQL ROUND(100 * SUM / COUNT, 0)
          acceptedPct: { $floor: { $add: [{ $divide: [{ $multiply: [100, '$accepted'] }, '$submissions'] }, 0.5] } },
        },
        updatedAt: { $literal: now },
      },
    },
    mergeInto('insert'),
  ];
}

/** "top topics": a submission counts once per tag of its problem (same rule as v_city_tag_counts) */
function topicsPipeline() {
  return [
    { $unwind: '$tags' },
    { $group: { _id: { cityId: '$cityId', tag: '$tags' }, count: { $sum: 1 } } },
    { $sort: { count: -1, '_id.tag': 1 } },
    { $group: { _id: '$_id.cityId', topics: { $push: { tag: '$_id.tag', count: '$count' } } } },
    { $project: { _id: 0, cityId: '$_id', topics: { $slice: ['$topics', TOP.topics] } } },
    mergeInto('discard'),
  ];
}

function verdictsPipeline() {
  return [
    { $group: { _id: { cityId: '$cityId', code: '$verdict' }, count: { $sum: 1 } } },
    { $sort: { count: -1, '_id.code': 1 } },
    { $group: { _id: '$_id.cityId', verdicts: { $push: { code: '$_id.code', count: '$count' } } } },
    { $project: { _id: 0, cityId: '$_id', verdicts: { $slice: ['$verdicts', TOP.verdicts] } } },
    mergeInto('discard'),
  ];
}

/** "most solved": distinct handles with an OK on the problem, ties by lower rating */
function mostSolvedPipeline() {
  return [
    { $match: { isAccepted: true } },
    {
      $group: {
        _id: { cityId: '$cityId', key: '$key' },
        name: { $first: '$problemName' },
        rating: { $first: '$rating' },
        solvers: { $addToSet: '$handle' },
      },
    },
    { $project: { name: 1, rating: 1, solvers: { $size: '$solvers' } } },
    { $sort: { solvers: -1, rating: 1, '_id.key': 1 } },
    {
      $group: {
        _id: '$_id.cityId',
        mostSolved: { $push: { name: '$name', key: '$_id.key', rating: '$rating', solvers: '$solvers' } },
      },
    },
    { $project: { _id: 0, cityId: '$_id', mostSolved: { $slice: ['$mostSolved', TOP.mostSolved] } } },
    mergeInto('discard'),
  ];
}

function languagesPipeline() {
  return [
    { $group: { _id: { cityId: '$cityId', name: '$languageFamily' }, count: { $sum: 1 } } },
    { $sort: { count: -1, '_id.name': 1 } },
    { $group: { _id: '$_id.cityId', languages: { $push: { name: '$_id.name', count: '$count' } } } },
    { $project: { _id: 0, cityId: '$_id', languages: { $slice: ['$languages', TOP.languages] } } },
    mergeInto('discard'),
  ];
}

function difficultyPipeline() {
  return [
    { $group: { _id: { cityId: '$cityId', bandIdx: '$bandIdx' }, count: { $sum: 1 } } },
    { $sort: { '_id.bandIdx': 1 } },
    {
      $group: {
        _id: '$_id.cityId',
        difficulty: {
          $push: { band: { $arrayElemAt: [{ $literal: BAND_LABELS }, '$_id.bandIdx'] }, count: '$count' },
        },
      },
    },
    { $project: { _id: 0, cityId: '$_id', difficulty: 1 } },
    mergeInto('discard'),
  ];
}

const withoutLastStage = (p) => p.slice(0, -1);

// ------------------------------------------------------------------ collection definitions
const VALIDATORS = {
  city_analytics: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['cityId', 'city', 'country', 'lat', 'lng', 'totals', 'updatedAt'],
      properties: {
        cityId: { bsonType: NUM, description: 'city.city_id in MySQL' },
        city: { bsonType: 'string' },
        country: { bsonType: 'string' },
        lat: { bsonType: NUM, minimum: -90, maximum: 90 },
        lng: { bsonType: NUM, minimum: -180, maximum: 180 },
        totals: {
          bsonType: 'object',
          required: ['submissions', 'users', 'accepted', 'acceptedPct'],
          properties: {
            submissions: { bsonType: NUM, minimum: 0 },
            users: { bsonType: NUM, minimum: 0 },
            accepted: { bsonType: NUM, minimum: 0 },
            acceptedPct: { bsonType: NUM, minimum: 0, maximum: 100 },
          },
        },
        topics: { bsonType: 'array', items: { bsonType: 'object', required: ['tag', 'count'] } },
        verdicts: { bsonType: 'array', items: { bsonType: 'object', required: ['code', 'count'] } },
        mostSolved: {
          bsonType: 'array',
          items: { bsonType: 'object', required: ['name', 'key', 'solvers'] },
        },
        languages: { bsonType: 'array', items: { bsonType: 'object', required: ['name', 'count'] } },
        difficulty: { bsonType: 'array', items: { bsonType: 'object', required: ['band', 'count'] } },
        updatedAt: { bsonType: 'date' },
      },
    },
  },
  // user-owned documents: the create / read / update / delete feature
  saved_views: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['userId', 'name', 'filters', 'createdAt'],
      properties: {
        userId: { bsonType: NUM, description: 'app_user.user_id in MySQL' },
        name: { bsonType: 'string', minLength: 1, maxLength: 80 },
        filters: { bsonType: 'object' },
        camera: {
          bsonType: 'object',
          properties: {
            lat: { bsonType: NUM, minimum: -90, maximum: 90 },
            lng: { bsonType: NUM, minimum: -180, maximum: 180 },
            zoom: { bsonType: NUM },
          },
        },
        createdAt: { bsonType: 'date' },
        updatedAt: { bsonType: 'date' },
      },
    },
  },
};

// ------------------------------------------------------------------ main
async function ensureCollection(db, name, validator) {
  const exists = (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
  if (!exists) await db.createCollection(name, validator ? { validator } : {});
  else if (validator) await db.command({ collMod: name, validator });
}

// createIndex that tolerates an index which already exists on the same key under the same
// name but with different options (e.g. the importer made it unique). Codes 85 / 86 =
// IndexOptionsConflict / IndexKeySpecsConflict: the lookup index we need is already there.
async function ensureIndex(collection, keys, options) {
  try {
    await collection.createIndex(keys, options);
  } catch (err) {
    if (err && (err.code === 85 || err.code === 86)) return;
    throw err;
  }
}

// opts.my  : an existing mysql2 pool/connection to reuse (not closed here)
// opts.db  : an existing MongoDB Db handle to reuse (not closed here)
// opts.log : logger (default console.log); pass () => {} to silence
async function main(args = new Set(process.argv.slice(2)), opts = {}) {
  const log = opts.log ?? console.log;
  let my = opts.my;
  let db = opts.db;
  let client = null;   // only set when this function opened the MongoDB connection itself
  const ownsMy = !my;

  if (!my || !db) {
    // Next.js project credentials live in .env.local, not .env.
    // dotenv does not overwrite variables already present in process.env by default.
    try { require('dotenv').config({ path: '.env.local' }); } catch { /* dotenv is optional */ }
  }
  if (!my) {
    const mysql = require('mysql2/promise');
    my = await mysql.createConnection({
      host: process.env.DB_HOST ?? process.env.MYSQL_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? process.env.MYSQL_PORT ?? 3306),
      user: process.env.DB_USER ?? process.env.MYSQL_USER ?? 'root',
      password: process.env.DB_PASSWORD ?? process.env.MYSQL_PASSWORD ?? '',
      database: process.env.DB_NAME ?? process.env.MYSQL_DATABASE ?? 'gcode',
    });
  }
  if (!db) {
    const { MongoClient } = require('mongodb');
    client = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
    await client.connect();
    db = client.db(process.env.MONGODB_DB || 'gcode');
  }

  try {
    // 1. handle -> city and city coordinates, straight from MySQL (the source of truth)
    const [rows] = await my.query(`
      SELECT a.handle, c.city_id AS cityId, c.name AS city, co.name AS country,
             c.latitude AS lat, c.longitude AS lng
      FROM platform_account a
      JOIN platform p ON p.platform_id = a.platform_id AND p.name = 'Codeforces'
      JOIN city c     ON c.city_id = a.city_id
      JOIN country co ON co.country_id = c.country_id`);
    log(`MySQL: ${rows.length} accounts with a resolved city`);

    const cities = new Map();
    for (const r of rows) {
      cities.set(r.cityId, { cityId: r.cityId, city: r.city, country: r.country, lat: Number(r.lat), lng: Number(r.lng) });
    }
    await db.collection('account_city').drop().catch(() => {});
    await db.collection('city_dim').drop().catch(() => {});
    await db.collection('account_city').insertMany(
      rows.map((r) => ({ handle: r.handle, handleLower: String(r.handle).toLowerCase(), cityId: r.cityId })));
    await db.collection('city_dim').insertMany([...cities.values()]);
    await db.collection('account_city').createIndex({ handleLower: 1 }, { unique: true });
    await db.collection('city_dim').createIndex({ cityId: 1 }, { unique: true });

    // 2. collections, validators, indexes
    await ensureCollection(db, 'city_analytics', VALIDATORS.city_analytics);
    await db.collection('city_analytics').createIndex({ cityId: 1 }, { unique: true });   // required by $merge
    await db.collection('city_analytics').createIndex({ country: 1 });
    await ensureCollection(db, 'saved_views', VALIDATORS.saved_views);
    await db.collection('saved_views').createIndex({ userId: 1, updatedAt: -1 });

    // lookup keys on the raw collections ('2060A' = contestId + index)
    await db.collection('raw_problems').updateMany(
      { key: { $exists: false } },
      [{ $set: { key: { $concat: [{ $toString: '$contestId' }, '$index'] } } }]);
    await ensureIndex(db.collection('raw_problems'), { key: 1 });
    await ensureIndex(db.collection('raw_submissions'), { id: 1 });
    await ensureIndex(db.collection('raw_users'), { handle: 1 });

    // 3. rebuild (city_analytics is derived data: safe to wipe and recompute)
    await db.collection('city_analytics').deleteMany({});
    await db.collection('tmp_city_submissions').drop().catch(() => {});
    await db.collection('raw_submissions').aggregate(enrichPipeline()).toArray();
    const usable = await db.collection('tmp_city_submissions').countDocuments();
    const rawTotal = await db.collection('raw_submissions').countDocuments();
    log(`Mongo: ${usable} of ${rawTotal} raw submissions are usable (final verdict + known city)`);

    // 4. one aggregation per panel section; totals first because it creates the city document
    const tmp = db.collection('tmp_city_submissions');
    for (const [name, pipeline] of [
      ['totals', totalsPipeline(new Date())],
      ['topics', topicsPipeline()],
      ['verdicts', verdictsPipeline()],
      ['mostSolved', mostSolvedPipeline()],
      ['languages', languagesPipeline()],
      ['difficulty', difficultyPipeline()],
    ]) {
      await tmp.aggregate(pipeline).toArray();
      log(`  built: ${name}`);
    }
    if (!args.has('--keep-tmp')) await tmp.drop().catch(() => {});

    const built = await db.collection('city_analytics').countDocuments();
    log(`city_analytics: ${built} city documents`);

    // 5. consistency check against the MySQL view
    if (!args.has('--no-verify')) {
      const [mysqlRows] = await my.query('SELECT city_id, city, submissions, users, accepted_pct FROM v_city_summary');
      const docs = new Map((await db.collection('city_analytics').find({}).toArray()).map((d) => [d.cityId, d]));
      const bad = [];
      for (const m of mysqlRows) {
        const d = docs.get(m.city_id);
        const mine = d && d.totals;
        if (!mine || mine.submissions !== Number(m.submissions) || mine.users !== Number(m.users)
            || mine.acceptedPct !== Number(m.accepted_pct)) {
          bad.push({ city: m.city, mysql: [Number(m.submissions), Number(m.users), Number(m.accepted_pct)],
                     mongo: mine ? [mine.submissions, mine.users, mine.acceptedPct] : null });
        }
      }
      log(`Verify vs v_city_summary: ${mysqlRows.length - bad.length}/${mysqlRows.length} cities match`
        + ' ([submissions, users, accepted%])');
      for (const b of bad.slice(0, 10)) log('  MISMATCH', JSON.stringify(b));
    }

    const sample = await db.collection('city_analytics').find({}).sort({ 'totals.submissions': -1 }).limit(1).next();
    if (sample) log('\nBusiest city document:\n' + JSON.stringify(sample, null, 2));

    // Several aliases on purpose: callers (sync route / worker) read these under different names.
    return {
      cities: built, built, cityCount: built,
      usable, usableSubmissions: usable, submissions: usable,
      rawTotal, rawSubmissions: rawTotal, total: rawTotal,
    };
  } finally {
    // only close what this function opened; the app's shared pool / Mongo handle stay open
    if (client) await client.close();
    if (ownsMy) await my.end();
  }
}

/**
 * Entry point for the Next.js sync route / worker.
 *   await buildCityAnalytics();                  // rebuild, skip the MySQL verification
 *   await buildCityAnalytics({ verify: true });  // rebuild + verify against v_city_summary
 *   await buildCityAnalytics({ keepTmp: true }); // keep tmp_city_submissions for inspection
 *   await buildCityAnalytics({ my: pool, db: mongo, verify: false, log: () => {} }); // reuse the app's connections
 * Resolves to { cities, usable, rawTotal, ... }.
 */
async function buildCityAnalytics({ verify = false, keepTmp = false, my, db, log } = {}) {
  const args = new Set();
  if (!verify) args.add('--no-verify');
  if (keepTmp) args.add('--keep-tmp');
  return main(args, { my, db, log });
}

module.exports = {
  buildCityAnalytics, main,
  TOP, BAND_LABELS, VALIDATORS, enrichPipeline, totalsPipeline, topicsPipeline, verdictsPipeline,
  mostSolvedPipeline, languagesPipeline, difficultyPipeline, withoutLastStage,
};

if (require.main === module) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
