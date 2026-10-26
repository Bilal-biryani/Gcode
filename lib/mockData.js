// ------------------------------------------------------------------
// TEMPORARY FAKE DATA
// ------------------------------------------------------------------
// The frontend works without a database by reading from here.
// Once MySQL / MongoDB are connected, the API routes in app/api/
// should stop importing this file and query the databases instead.
// When every route is switched over, delete this file.
//
// The shapes below are the "contract" between frontend and backend:
// your real queries must return objects that look like these.
// ------------------------------------------------------------------

// One dot on the globe = one region (a city, or a country if the city is unknown)
export const regions = [
  { id: 1, city: "Dhaka", country: "Bangladesh", lat: 23.81, lng: 90.41, submissions: 1840, users: 312, solved: 1012 },
  { id: 2, city: "Hyderabad", country: "India", lat: 17.38, lng: 78.48, submissions: 1520, users: 268, solved: 803 },
  { id: 3, city: "Beijing", country: "China", lat: 39.9, lng: 116.4, submissions: 2210, users: 355, solved: 1405 },
  { id: 4, city: "Chengdu", country: "China", lat: 30.57, lng: 104.06, submissions: 760, users: 121, solved: 455 },
  { id: 5, city: "Hangzhou", country: "China", lat: 30.27, lng: 120.15, submissions: 980, users: 140, solved: 610 },
  { id: 6, city: "Ningbo", country: "China", lat: 29.87, lng: 121.54, submissions: 410, users: 66, solved: 240 },
  { id: 7, city: "Mianyang", country: "China", lat: 31.47, lng: 104.68, submissions: 220, users: 35, solved: 131 },
  { id: 8, city: "Patiala", country: "India", lat: 30.34, lng: 76.39, submissions: 380, users: 74, solved: 190 },
  { id: 9, city: "Sikar", country: "India", lat: 27.61, lng: 75.14, submissions: 150, users: 29, solved: 70 },
  { id: 10, city: "Bengaluru", country: "India", lat: 12.97, lng: 77.59, submissions: 1690, users: 290, solved: 930 },
  { id: 11, city: "Delhi", country: "India", lat: 28.61, lng: 77.21, submissions: 1270, users: 231, solved: 660 },
  { id: 12, city: "Dinajpur", country: "Bangladesh", lat: 25.63, lng: 88.64, submissions: 140, users: 22, solved: 66 },
  { id: 13, city: "Beersheba", country: "Israel", lat: 31.25, lng: 34.79, submissions: 120, users: 18, solved: 77 },
  { id: 14, city: "Tehran", country: "Iran", lat: 35.69, lng: 51.39, submissions: 640, users: 98, solved: 371 },
  { id: 15, city: "Moscow", country: "Russia", lat: 55.76, lng: 37.62, submissions: 1930, users: 284, solved: 1290 },
  { id: 16, city: "Saint Petersburg", country: "Russia", lat: 59.93, lng: 30.36, submissions: 1100, users: 150, solved: 760 },
  { id: 17, city: "Minsk", country: "Belarus", lat: 53.9, lng: 27.57, submissions: 420, users: 61, solved: 280 },
  { id: 18, city: "Almaty", country: "Kazakhstan", lat: 43.24, lng: 76.89, submissions: 360, users: 57, solved: 205 },
  { id: 19, city: "Hanoi", country: "Vietnam", lat: 21.03, lng: 105.85, submissions: 590, users: 92, solved: 330 },
  { id: 20, city: "Seoul", country: "South Korea", lat: 37.57, lng: 126.98, submissions: 530, users: 70, solved: 360 },
  { id: 21, city: "Tokyo", country: "Japan", lat: 35.68, lng: 139.69, submissions: 470, users: 63, solved: 322 },
  { id: 22, city: "Cairo", country: "Egypt", lat: 30.04, lng: 31.24, submissions: 870, users: 166, solved: 430 },
  { id: 23, city: "Damascus", country: "Syria", lat: 33.51, lng: 36.28, submissions: 210, users: 38, solved: 104 },
  { id: 24, city: "Banjul", country: "Gambia", lat: 13.45, lng: -16.58, submissions: 40, users: 6, solved: 17 },
  { id: 25, city: "New York", country: "United States", lat: 40.71, lng: -74.0, submissions: 390, users: 58, solved: 245 },
  { id: 26, city: "San Francisco", country: "United States", lat: 37.77, lng: -122.42, submissions: 310, users: 44, solved: 210 },
  { id: 27, city: "São Paulo", country: "Brazil", lat: -23.55, lng: -46.63, submissions: 280, users: 47, solved: 160 },
  { id: 28, city: "Warsaw", country: "Poland", lat: 52.23, lng: 21.01, submissions: 450, users: 60, solved: 300 },
];

const allTags = [
  "greedy", "implementation", "math", "brute force", "constructive algorithms",
  "dp", "graphs", "trees", "data structures", "binary search", "strings", "sortings",
];
const allVerdicts = [
  "OK", "WRONG_ANSWER", "TIME_LIMIT_EXCEEDED", "COMPILATION_ERROR", "RUNTIME_ERROR",
];

export const problems = [
  { id: "2060A", name: "Fibonacciness", rating: 800, tags: ["brute force"], solvedCount: 412 },
  { id: "4A", name: "Watermelon", rating: 800, tags: ["brute force", "math"], solvedCount: 980 },
  { id: "2044B", name: "Normal Problem", rating: 800, tags: ["implementation", "strings"], solvedCount: 377 },
  { id: "1985B", name: "Even Array", rating: 800, tags: ["greedy", "math"], solvedCount: 351 },
  { id: "2060B", name: "Don't Try to Count", rating: 800, tags: ["brute force", "strings"], solvedCount: 290 },
  { id: "379A", name: "New Year Candles", rating: 1000, tags: ["implementation"], solvedCount: 268 },
  { id: "500A", name: "New Year Transportation", rating: 1000, tags: ["dfs and similar", "graphs", "implementation"], solvedCount: 240 },
  { id: "2051D", name: "Counting Pairs", rating: 1200, tags: ["binary search", "sortings"], solvedCount: 198 },
  { id: "2053C", name: "Bewitching Stargazer", rating: 1500, tags: ["dp", "math"], solvedCount: 120 },
  { id: "2057D", name: "Gifts Order", rating: 2000, tags: ["data structures", "math"], solvedCount: 66 },
  { id: "2053E", name: "Caterpillar on a Tree", rating: 2500, tags: ["dfs and similar", "graphs", "greedy", "trees"], solvedCount: 21 },
  { id: "2056F", name: "Counting Cute Arrays", rating: 2700, tags: ["combinatorics", "dp"], solvedCount: 9 },
  { id: "1520G", name: "To Go Or Not To Go?", rating: 2200, tags: ["graphs", "dfs and similar"], solvedCount: 54 },
  { id: "1700C", name: "Helping the Nature", rating: 1700, tags: ["constructive algorithms", "greedy"], solvedCount: 140 },
];

export const tags = [...new Set(problems.flatMap((p) => p.tags))].sort();

// Fake per-region detail, made up from the region id so it is the same on every request
export function regionDetail(id) {
  const region = regions.find((r) => r.id === Number(id));
  if (!region) return null;

  const pick = (list, n, seed) =>
    list.map((name, i) => ({ name, count: ((seed * (i + 3) * 37) % 90) + 10 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, n);

  return {
    ...region,
    topTags: pick(allTags, 6, region.id),
    verdicts: [0.45, 0.33, 0.1, 0.07, 0.05].map((share, i) => ({
      name: allVerdicts[i],
      count: Math.round(region.submissions * share),
    })),
    topProblems: problems.slice(region.id % 5, (region.id % 5) + 5),
  };
}

export const adminStats = {
  totalSubmissions: regions.reduce((s, r) => s + r.submissions, 0),
  totalUsers: regions.reduce((s, r) => s + r.users, 0),
  totalProblems: problems.length,
  usersWithoutLocation: 64, // percent, from the first collector run
  lastSync: "2026-10-26 18:40",
  syncLog: [
    { id: 3, startedAt: "2026-10-26 18:40", fetched: 100, inserted: 94, status: "OK" },
    { id: 2, startedAt: "2026-10-26 12:10", fetched: 100, inserted: 97, status: "OK" },
    { id: 1, startedAt: "2026-10-25 21:05", fetched: 100, inserted: 0, status: "FAILED" },
  ],
};
