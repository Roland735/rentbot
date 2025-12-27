import { getDb } from "./db.js";

function id(prefix) {
  return `${prefix}-${Date.now()}`;
}

export async function ensureUser(phone) {
  const db = await getDb();
  const col = db.collection("users");
  const existing = await col.findOne({ phone });
  if (existing) return existing;
  const user = {
    phone,
    credits: 3,
    verified: false,
    role: "user",
    searchCountDay: 0,
    photoRequestCountDay: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await col.insertOne(user);
  return user;
}

export async function getUser(phone) {
  const db = await getDb();
  return db.collection("users").findOne({ phone });
}

export async function updateCredits(phone, delta) {
  const db = await getDb();
  const col = db.collection("users");
  if (delta < 0) {
    const ok = await col.updateOne({ phone, credits: { $gte: -delta } }, { $inc: { credits: delta }, $set: { updatedAt: new Date() } });
    return ok.modifiedCount === 1;
  } else {
    const ok = await col.updateOne({ phone }, { $inc: { credits: delta }, $set: { updatedAt: new Date() } });
    return ok.modifiedCount === 1;
  }
}

export async function setOptOut(phone, optedOut) {
  const db = await getDb();
  const col = db.collection("users");
  await col.updateOne({ phone }, { $set: { optedOut: !!optedOut, updatedAt: new Date() } });
}

export async function getListingById(id) {
  const db = await getDb();
  return db.collection("listings").findOne({ id });
}

export async function searchListings(query) {
  const db = await getDb();
  const col = db.collection("listings");
  const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\$&"), "i");
  const cursor = col.find({
    $or: [
      { suburb: regex },
      { title: regex },
      { text: regex }
    ]
  }).limit(10).sort({ createdAt: -1 });
  return cursor.toArray();
}

export async function createPhotoRequest(phone, listingId) {
  const db = await getDb();
  const col = db.collection("photoRequests");
  const existing = await col.findOne({ phone, status: "pending_confirmation" });
  if (existing) return existing;
  const doc = { phone, listingId, status: "pending_confirmation", createdAt: new Date() };
  await col.insertOne(doc);
  return doc;
}

export async function getPendingPhotoRequest(phone) {
  const db = await getDb();
  return db.collection("photoRequests").findOne({ phone, status: "pending_confirmation" });
}

export async function confirmPhotoRequest(phone) {
  const db = await getDb();
  const col = db.collection("photoRequests");
  await col.updateOne({ phone, status: "pending_confirmation" }, { $set: { status: "completed", confirmedAt: new Date() } });
}

export async function createListingDraft(phone, shortText) {
  const db = await getDb();
  const col = db.collection("listings");
  const doc = {
    id: id("RNT"),
    ownerPhone: phone,
    title: shortText,
    suburb: "",
    rent: 0,
    contactPhone: phone,
    text: shortText,
    external_images: [],
    published: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  await col.insertOne(doc);
  return doc;
}

export async function createModerationTicket(phone, listingId, reason) {
  const db = await getDb();
  const col = db.collection("moderation");
  const doc = { phone, listingId, reason, status: "open", createdAt: new Date() };
  await col.insertOne(doc);
  return doc;
}

export async function addTransaction(tx) {
  const db = await getDb();
  await db.collection("transactions").insertOne({ ...tx, createdAt: new Date() });
}
