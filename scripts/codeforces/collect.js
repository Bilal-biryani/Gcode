
import fs from "node:fs/promises";
import path from "node:path";

import {
  getProblems,
  getContests,
  getRecentSubmissions,
  getUserInfo
} from "./api.js";

import {
  normalizeUser,
  normalizeProblem,
  normalizeContest,
  normalizeSubmission
} from "./normalize.js";

const OUTPUT = path.resolve("data/codeforces");

async function saveJSON(folder, filename, data) {
  const directory = path.join(OUTPUT, folder);

  await fs.mkdir(directory, { recursive: true });

  const filePath = path.join(directory, filename);

  await fs.writeFile(
    filePath,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  console.log(`Saved ${filePath}`);
}

async function collect() {
  console.log("\n========== GCODE COLLECTION STARTED ==========\n");

  // 1. Fetch problems and their statistics.
  console.log("1. Fetching problems...");

  const problemResult = await getProblems();

  const problems = problemResult.problems.map(
    normalizeProblem
  );

  const problemStatistics = problemResult.problemStatistics;

  // 2. Fetch contests.
  console.log("\n2. Fetching contests...");

  const contestResult = await getContests();

  const contests = contestResult.map(normalizeContest);

  // 3. Fetch recent submissions.
  console.log("\n3. Fetching recent submissions...");

  const submissionResult = await getRecentSubmissions(1000);

  const submissions = submissionResult.map(
    normalizeSubmission
  );

  // 4. Discover unique handles from submissions.
  console.log("\n4. Discovering users...");

  const handles = [
    ...new Set(
      submissions.flatMap(s => s.participants)
    )
  ];

  console.log(`Unique handles discovered: ${handles.length}`);

  // 5. Fetch profiles in one batch.
  console.log("\n5. Fetching user profiles...");

  const userResult = await getUserInfo(handles);

  const users = userResult.map(normalizeUser);

  // 6. Create collection metadata.
  const metadata = {
    source: "Codeforces",
    collectedAt: new Date().toISOString(),

    counts: {
      problems: problems.length,
      contests: contests.length,
      submissions: submissions.length,
      discoveredHandles: handles.length,
      resolvedUsers: users.length
    }
  };

  // 7. Save normalized data.
  await saveJSON("normalized", "users.json", users);
  await saveJSON("normalized", "problems.json", problems);
  await saveJSON("normalized", "contests.json", contests);
  await saveJSON("normalized", "submissions.json", submissions);
  await saveJSON(
    "normalized",
    "problem_statistics.json",
    problemStatistics
  );

  // 8. Preserve original API responses for auditing.
  await saveJSON("raw", "users.json", userResult);
  await saveJSON("raw", "problems.json", problemResult);
  await saveJSON("raw", "contests.json", contestResult);
  await saveJSON("raw", "submissions.json", submissionResult);

  await saveJSON("normalized", "metadata.json", metadata);

  console.log("\n========== COLLECTION COMPLETED ==========");
  console.table(metadata.counts);
}

collect().catch(error => {
  console.error("\nCollection failed:", error);
  process.exitCode = 1;
});
