import test from "node:test";
import assert from "node:assert";
import { MongoClient } from "mongodb";
import { closeDb } from "../src/lib/db.js";
import { ensureCollections } from "../src/lib/schema.js";
import { ensureUser, getUser, updateCredits } from "../src/lib/store.js";

process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
process.env.MONGODB_DB_NAME = "RentBotTest";

test("ensureUser creates user with 3 credits", async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);
  await ensureCollections(db);
  await db.collection("users").deleteMany({ phone: "+111" });
  const u = await ensureUser("+111");
  assert.equal(u.credits, 3);
  await client.close();
  await closeDb();
});

test("updateCredits prevents overdraft", async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB_NAME);
  await ensureCollections(db);
  await db.collection("users").deleteMany({ phone: "+222" });
  await ensureUser("+222");
  const ok1 = await updateCredits("+222", -2);
  assert.equal(ok1, true);
  const u1 = await getUser("+222");
  assert.equal(u1.credits, 1);
  const ok2 = await updateCredits("+222", -2);
  assert.equal(ok2, false);
  const u2 = await getUser("+222");
  assert.equal(u2.credits, 1);
  await client.close();
  await closeDb();
});

