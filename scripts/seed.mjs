import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { MongoClient } from "mongodb";
import { ensureCollections } from "../src/lib/schema.js";

const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";
const dbName = process.env.MONGODB_DB_NAME || "rentbot";

function now() {
  return new Date();
}

const users = [
  {
    phone: "+263771234567",
    credits: 5,
    verified: false,
    role: "user",
    searchCountDay: 0,
    photoRequestCountDay: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    phone: "+263771234568",
    credits: 3,
    verified: true,
    role: "landlord",
    searchCountDay: 0,
    photoRequestCountDay: 0,
    createdAt: now(),
    updatedAt: now(),
  },
];

const listings = [
  {
    id: "RNT-1001",
    ownerPhone: "+263771234568",
    title: "2BR",
    suburb: "Avondale",
    rent: 280,
    contactPhone: "0771234567",
    text: "Avondale — 2BR — $280",
    external_images: [],
    published: true,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "RNT-1002",
    ownerPhone: "+263771234568",
    title: "2BR",
    suburb: "Borrowdale",
    rent: 320,
    contactPhone: "0773456789",
    text: "Borrowdale — 2BR — $320",
    type: "house",
    amenities: ["parking", "wifi", "geyser"],
    external_images: [],
    published: true,
    createdAt: now(),
    updatedAt: now(),
  },
];

const transactions = [
  {
    reference: "CRD-89342",
    phone: "+263771234568",
    product: "listing_publish",
    type: "listing_publish",
    status: "success",
    amount: 3.0,
    providerRef: "provider-abc",
    createdAt: now(),
  },
];

async function upsertMany(collection, docs, uniqueKey) {
  for (const doc of docs) {
    const filter = { [uniqueKey]: doc[uniqueKey] };
    await collection.updateOne(filter, { $set: doc }, { upsert: true });
  }
}

async function main() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

  await ensureCollections(db);

  await upsertMany(db.collection("users"), users, "phone");
  await upsertMany(db.collection("listings"), listings, "id");
  await upsertMany(db.collection("transactions"), transactions, "reference");

  console.log("Seed complete", {
    users: users.length,
    listings: listings.length,
    transactions: transactions.length,
    db: dbName,
    uri,
  });

  await client.close();
}

main().catch((err) => {
  console.error("Seed error", err);
  process.exitCode = 1;
});

