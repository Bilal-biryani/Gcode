// MongoDB connection, used by the API routes.
//
// TODO:
//   1. npm install mongodb
//   2. Create one MongoClient using MONGODB_URI and MONGODB_DB from .env.local
//   3. Export a function that returns the connected database, then in a route:
//        const db = await getMongoDb();
//        const docs = await db.collection("raw_submissions").find({}).toArray();
//
// Same dev-reload tip as mysql.js applies: reuse one client, don't connect per request.
