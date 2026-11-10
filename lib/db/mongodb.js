// MongoDB client, shared by the API routes and the sync scripts.

import { MongoClient } from "mongodb";

export async function getMongoDb() {
  if (!globalThis.__gcodeMongoClient) {
    const client = new MongoClient(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017", {
      serverSelectionTimeoutMS: 5000,
    });
    globalThis.__gcodeMongoClient = client.connect();
  }
  try {
    const client = await globalThis.__gcodeMongoClient;
    return client.db(process.env.MONGODB_DB || "gcode");
  } catch (error) {
    globalThis.__gcodeMongoClient = undefined;   // let the next call retry instead of caching the failure
    throw error;
  }
}

export async function closeMongo() {
  if (globalThis.__gcodeMongoClient) {
    const client = await globalThis.__gcodeMongoClient.catch(() => null);
    await client?.close();
    globalThis.__gcodeMongoClient = undefined;
  }
}
