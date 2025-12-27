import { getDb } from "./db.js";

const SEARCH_DAY_LIMIT = 200;
const PHOTO_DAY_LIMIT_UNVERIFIED = 5;
const THROTTLE_MS = 60_000;

export async function canSearch(phone) {
  const db = await getDb();
  const u = await db.collection("users").findOne({ phone });
  const now = Date.now();
  const reset = u?.rateResetAt ? new Date(u.rateResetAt).getTime() : 0;
  if (!u?.rateResetAt || now - reset > 24 * 60 * 60 * 1000) {
    await db.collection("users").updateOne({ phone }, { $set: { rateResetAt: new Date(), searchCountDay: 0, photoRequestCountDay: 0 } });
    return { ok: true };
  }
  if ((u.searchCountDay || 0) >= SEARCH_DAY_LIMIT) return { ok: false, reason: "daily_limit" };
  const last = u?.lastSearchAt ? new Date(u.lastSearchAt).getTime() : 0;
  if (now - last < THROTTLE_MS) return { ok: false, reason: "throttled" };
  return { ok: true };
}

export async function recordSearch(phone) {
  const db = await getDb();
  await db.collection("users").updateOne({ phone }, { $inc: { searchCountDay: 1 }, $set: { lastSearchAt: new Date(), updatedAt: new Date() } });
}

export async function canPhotos(phone) {
  const db = await getDb();
  const u = await db.collection("users").findOne({ phone });
  const now = Date.now();
  const reset = u?.rateResetAt ? new Date(u.rateResetAt).getTime() : 0;
  if (!u?.rateResetAt || now - reset > 24 * 60 * 60 * 1000) {
    await db.collection("users").updateOne({ phone }, { $set: { rateResetAt: new Date(), searchCountDay: 0, photoRequestCountDay: 0 } });
    return { ok: true };
  }
  const limit = u?.verified ? PHOTO_DAY_LIMIT_UNVERIFIED * 2 : PHOTO_DAY_LIMIT_UNVERIFIED;
  if ((u.photoRequestCountDay || 0) >= limit) return { ok: false, reason: "daily_limit" };
  const last = u?.lastPhotoReqAt ? new Date(u.lastPhotoReqAt).getTime() : 0;
  if (now - last < THROTTLE_MS) return { ok: false, reason: "throttled" };
  return { ok: true };
}

export async function recordPhotos(phone) {
  const db = await getDb();
  await db.collection("users").updateOne({ phone }, { $inc: { photoRequestCountDay: 1 }, $set: { lastPhotoReqAt: new Date(), updatedAt: new Date() } });
}

