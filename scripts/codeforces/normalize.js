
export function normalizeUser(user) {
  return {
    platform: "Codeforces",
    handle: user.handle,

    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,

    rank: user.rank ?? null,
    rating: user.rating ?? null,
    maxRating: user.maxRating ?? null,
    maxRank: user.maxRank ?? null,

    country: user.country ?? null,
    city: user.city ?? null,
    organization: user.organization ?? null,

    registrationTime: user.registrationTimeSeconds
      ? new Date(user.registrationTimeSeconds * 1000).toISOString()
      : null,

    lastOnlineTime: user.lastOnlineTimeSeconds
      ? new Date(user.lastOnlineTimeSeconds * 1000).toISOString()
      : null,

    avatar: user.avatar ?? null
  };
}

export function normalizeProblem(problem) {
  const externalKey = problem.contestId != null
    ? `${problem.contestId}${problem.index}`
    : `${problem.problemsetName ?? "unknown"}:${problem.index}`;

  return {
    platform: "Codeforces",
    externalKey,
    contestExternalId: problem.contestId?.toString() ?? null,
    problemsetName: problem.problemsetName ?? null,
    index: problem.index,
    name: problem.name,
    type: problem.type ?? null,
    rating: problem.rating ?? null,
    points: problem.points ?? null,
    tags: problem.tags ?? []
  };
}

export function normalizeContest(contest) {
  return {
    platform: "Codeforces",
    externalId: String(contest.id),
    name: contest.name,
    type: contest.type,
    phase: contest.phase,
    startTime: contest.startTimeSeconds
      ? new Date(contest.startTimeSeconds * 1000).toISOString()
      : null,
    durationSeconds: contest.durationSeconds ?? null
  };
}

export function normalizeSubmission(submission) {
  const problem = normalizeProblem(submission.problem);

  return {
    platform: "Codeforces",

    externalId: String(submission.id),

    participants: (
      submission.author?.members ?? []
    ).map(member => member.handle),

    contestExternalId:
      submission.problem?.contestId?.toString() ?? null,

    problemExternalKey: problem.externalKey,

    problem,

    verdict: submission.verdict ?? null,

    // TESTING or missing verdicts are retained in the
    // collection output, but are not final results.

    language: submission.programmingLanguage ?? null,

    submittedAt: submission.creationTimeSeconds
      ? new Date(
          submission.creationTimeSeconds * 1000
        ).toISOString()
      : null,

    timeConsumedMillis:
      submission.timeConsumedMillis ?? null,

    memoryConsumedBytes:
      submission.memoryConsumedBytes ?? null
  };
}
