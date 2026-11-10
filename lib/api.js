// Small helpers shared by the API routes.

// Turn a database error into a JSON response instead of an HTML error page.
export function dbError(error, what) {
  console.error(`[api] ${what}:`, error);
  const down = /ECONNREFUSED|ENOTFOUND|Server selection timed out|ER_ACCESS_DENIED|ER_BAD_DB_ERROR/i
    .test(`${error.code} ${error.message}`);
  return Response.json(
    { error: down ? `Database unavailable while loading ${what}. Is MySQL/MongoDB running?` : `Could not load ${what}.` },
    { status: down ? 503 : 500 }
  );
}

// city_analytics document -> the shape the globe and side panel use
export function toRegion(doc) {
  return {
    id: doc.cityId,
    city: doc.city,
    country: doc.country,
    lat: doc.lat,
    lng: doc.lng,
    submissions: doc.totals.submissions,
    users: doc.totals.users,
    solved: doc.totals.accepted,
    acceptedPct: doc.totals.acceptedPct,
    updatedAt: doc.updatedAt,
  };
}
