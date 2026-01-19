import { MongoClient } from "mongodb";
import { ensureCollections } from "./schema.js";

let client;
let ensured = false;

export async function getDb() {
  if (!client) {
    client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
  }
  const db = client.db(process.env.MONGODB_DB_NAME);
  if (!ensured) {
    try {
      await ensureCollections(db);
    } catch {}
    ensured = true;
  }
  return db;
}

export async function closeDb() {
  if (!client) return;
  await client.close();
  client = undefined;
  ensured = false;
}

