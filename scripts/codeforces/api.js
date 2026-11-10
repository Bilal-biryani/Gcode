
const BASE_URL = "https://codeforces.com/api";

let lastRequestTime = 0;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function cfRequest(method, params = {}) {
  // Codeforces allows at most one request every two seconds.
  const elapsed = Date.now() - lastRequestTime;
  const waitTime = Math.max(0, 2100 - elapsed);

  if (waitTime > 0) {
    await sleep(waitTime);
  }

  const url = new URL(`${BASE_URL}/${method}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  console.log(`Fetching: ${method}`);

  let response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      headers: {
        "User-Agent": "GCode-DataCollector/1.0"
      }
    });
  } finally {
    lastRequestTime = Date.now();
  }

  if (!response.ok) {
    throw new Error(
      `HTTP error ${response.status} for ${method}`
    );
  }

  const data = await response.json();

  if (data.status !== "OK") {
    throw new Error(
      `Codeforces API error: ${data.comment}`
    );
  }

  return data.result;
}

// Fetch the complete available problemset.
export async function getProblems() {
  return cfRequest("problemset.problems");
}

// Fetch available contests.
export async function getContests() {
  return cfRequest("contest.list", { gym: false });
}

// Fetch recent submissions (maximum 1000).
export async function getRecentSubmissions(count = 1000) {
  if (count < 1 || count > 1000) {
    throw new Error("Submission count must be 1-1000");
  }

  return cfRequest("problemset.recentStatus", { count });
}

// Fetch multiple user profiles in one request.
export async function getUserInfo(handles) {
    if (handles.length === 0) return [];

    const batchSize = 50;
    const allUsers = [];

    for (let i = 0; i < handles.length; i += batchSize) {
        const batch = handles.slice(i, i + batchSize);

        console.log(
            `Fetching users ${i + 1} to ${i + batch.length} of ${handles.length}`
        );

        const users = await cfRequest("user.info", {
            handles: batch.join(";")
        });

        allUsers.push(...users);
    }

    return allUsers;
}

// Fetch submission history for one user.
export async function getUserSubmissions(
  handle,
  from = 1,
  count = 100
) {
  return cfRequest("user.status", {
    handle,
    from,
    count
  });
}

// Fetch rating history for one user.
export async function getUserRatingHistory(handle) {
  return cfRequest("user.rating", { handle });
}
