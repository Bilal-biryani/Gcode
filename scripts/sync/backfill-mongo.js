// One-time setup: copy the collector's raw snapshot (data/codeforces/raw/*.json) into MongoDB.
// Replaces importing the files by hand in Compass. Safe to re-run (upserts).
//
//   npm run collect          # writes data/codeforces/raw/*.json
//   npm run backfill:mongo   # this script

import "../env.js";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeProblem } from "../codeforces/normalize.js";
import { getMongoDb, closeMongo } from "../../lib/db/mongodb.js";
import { ensureRawIndexes } from "./outbox-to-mongo.js";

const RAW = path.resolve("data/codeforces/raw");

async function readRaw(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(RAW, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function upsertAll(mongo, collection, docs, keyOf) {
  if (!docs?.length) return 0;
  const now = new Date();
  for (let i = 0; i < docs.length; i += 1000) {
    const ops = docs.slice(i, i + 1000).map((doc) => ({
      replaceOne: { filter: keyOf(doc), replacement: { ...doc, _syncedAt: now }, upsert: true },
    }));
    await mongo.collection(collection).bulkWrite(ops, { ordered: false });
  }
  console.log(`${collection}: ${docs.length} documents`);
  return docs.length;
}

const mongo = await getMongoDb();
try {
  await ensureRawIndexes(mongo);

  const problemset = await readRaw("problems.json");
  // problemset.problems comes grouped as { problems, problemStatistics }: one document per problem
  const problems = (problemset?.problems ?? []).map((p) => ({ ...p, key: normalizeProblem(p).externalKey }));

  await upsertAll(mongo, "raw_problems", problems, (d) => ({ key: d.key }));
  await upsertAll(mongo, "raw_contests", await readRaw("contests.json"), (d) => ({ id: d.id }));
  await upsertAll(mongo, "raw_users", await readRaw("users.json"), (d) => ({ handle: d.handle }));
  await upsertAll(mongo, "raw_submissions", await readRaw("submissions.json"), (d) => ({ id: d.id }));
} finally {
  await closeMongo();
}
