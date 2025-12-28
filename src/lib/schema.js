// src/lib/schema.js
// Schemas, indexes and helpers for creating collections with strict JSON Schema validation.

export const usersSchema = {
  bsonType: "object",
  required: ["phone", "credits", "createdAt", "updatedAt"],
  properties: {
    phone: { bsonType: "string" },
    // Accept either int32 or double to avoid validation failures when inserting plain JS numbers
    credits: { bsonType: ["int", "double"], minimum: 0 },
    verified: { bsonType: "bool" },
    role: { bsonType: "string" },
    searchCountDay: { bsonType: ["int", "double"], minimum: 0 },
    photoRequestCountDay: { bsonType: ["int", "double"], minimum: 0 },
    draftStatus: { bsonType: "string" },
    currentDraftId: { bsonType: "string" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" }
  },
  additionalProperties: true
};
export const usersIndexes = [
  { key: { phone: 1 }, name: "users_phone_unique", unique: true },
  { key: { credits: 1 }, name: "users_credits_idx" }
];

export const listingsSchema = {
  bsonType: "object",
  required: ["ownerPhone", "published", "createdAt"],
  properties: {
    id: { bsonType: "string" },
    ownerPhone: { bsonType: "string" },
    title: { bsonType: "string" },
    suburb: { bsonType: "string" },
    // rent can be int or double
    rent: { bsonType: ["int", "double"], minimum: 0 },
    deposit: { bsonType: ["int", "double"], minimum: 0 },
    bedrooms: { bsonType: ["int", "double", "string"] },
    contactPhone: { bsonType: "string" },
    contactName: { bsonType: "string" },
    address: { bsonType: "string" },
    text: { bsonType: "string" },
    type: { bsonType: "string" },
    amenities: { bsonType: "array", items: { bsonType: "string" } },
    external_images: { bsonType: "array", items: { bsonType: "string" } },
    published: { bsonType: "bool" },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" }
  },
  additionalProperties: true
};
export const listingsIndexes = [
  { key: { id: 1 }, name: "listings_id_unique", unique: true },
  { key: { ownerPhone: 1 }, name: "listings_owner_idx" },
  { key: { published: 1, createdAt: -1 }, name: "listings_published_idx" }
];

export const photoRequestsSchema = {
  bsonType: "object",
  required: ["phone", "listingId", "status", "createdAt"],
  properties: {
    phone: { bsonType: "string" },
    listingId: { bsonType: "string" },
    status: {
      enum: ["pending_confirmation", "completed", "canceled"],
      description: "enum"
    },
    createdAt: { bsonType: "date" },
    confirmedAt: { bsonType: "date" }
  },
  additionalProperties: true
};
export const photoRequestsIndexes = [
  { key: { phone: 1, status: 1 }, name: "photoRequests_phone_status_idx" },
  { key: { listingId: 1 }, name: "photoRequests_listing_idx" },
  { key: { createdAt: -1 }, name: "photoRequests_created_idx" }
];

export const transactionsSchema = {
  bsonType: "object",
  required: ["reference", "phone", "amount", "status", "createdAt"],
  properties: {
    reference: { bsonType: "string" },
    phone: { bsonType: "string" },
    product: { bsonType: "string" },
    type: { enum: ["credit_purchase", "listing_publish"], description: "enum" },
    status: { enum: ["pending", "success", "failed"], description: "enum" },
    // accept int or double
    amount: { bsonType: ["int", "double"], minimum: 0 },
    providerRef: { bsonType: "string" },
    createdAt: { bsonType: "date" }
  },
  additionalProperties: true
};
export const transactionsIndexes = [
  { key: { reference: 1 }, name: "transactions_reference_unique", unique: true },
  { key: { phone: 1, createdAt: -1 }, name: "transactions_phone_created_idx" },
  { key: { status: 1 }, name: "transactions_status_idx" }
];

export const moderationSchema = {
  bsonType: "object",
  required: ["phone", "listingId", "reason", "status", "createdAt"],
  properties: {
    phone: { bsonType: "string" },
    listingId: { bsonType: "string" },
    reason: { bsonType: "string" },
    status: { enum: ["open", "closed"], description: "enum" },
    createdAt: { bsonType: "date" },
    resolvedAt: { bsonType: "date" }
  },
  additionalProperties: true
};
export const moderationIndexes = [
  { key: { listingId: 1 }, name: "moderation_listing_idx" },
  { key: { status: 1, createdAt: -1 }, name: "moderation_status_created_idx" }
];

/**
 * Ensure collections exist and have the JSON schema validator applied.
 * Also create indexes for collections that need them.
 */
export async function ensureCollections(db) {
  const defs = {
    users: { schema: usersSchema, indexes: usersIndexes },
    listings: { schema: listingsSchema, indexes: listingsIndexes },
    photoRequests: { schema: photoRequestsSchema, indexes: photoRequestsIndexes },
    transactions: { schema: transactionsSchema, indexes: transactionsIndexes },
    moderation: { schema: moderationSchema, indexes: moderationIndexes }
  };

  const existing = await db.listCollections().toArray();
  const names = new Set(existing.map(c => c.name));

  for (const [name, def] of Object.entries(defs)) {
    if (!names.has(name)) {
      await db.createCollection(name, {
        validator: { $jsonSchema: def.schema },
        validationLevel: "strict",
        validationAction: "error"
      });
    } else {
      // update validator if collection exists (collMod may fail on some older servers)
      try {
        await db.command({
          collMod: name,
          validator: { $jsonSchema: def.schema },
          validationLevel: "strict",
          validationAction: "error"
        });
      } catch (e) {
        // If collMod isn't supported or fails, ignore - collection remains as-is.
        // (This mirrors the previous behavior — it's safe to continue.)
      }
    }

    if (def.indexes && def.indexes.length) {
      await ensureIndexes(db.collection(name), def.indexes);
    }
  }
}

/**
 * Create indexes from defs, but do not include null/undefined options (Mongo rejects null).
 * defs: array of { key, name, unique?, sparse?, partialFilterExpression? }
 */
async function ensureIndexes(collection, defs) {
  const idxs = defs.map(d => {
    // start with the required fields
    const idx = { key: d.key, name: d.name };

    // only include optional fields if they are explicitly present and not null/undefined
    if (d.unique !== undefined && d.unique !== null) idx.unique = !!d.unique;
    if (d.sparse !== undefined && d.sparse !== null) idx.sparse = !!d.sparse;
    if (d.partialFilterExpression !== undefined && d.partialFilterExpression !== null) {
      idx.partialFilterExpression = d.partialFilterExpression;
    }

    return idx;
  });

  if (idxs.length) {
    try {
      await collection.createIndexes(idxs);
    } catch (err) {
      // If an index already exists with a different specification, createIndexes throws.
      // Log and continue — this mirrors previous tolerant behavior.
      // You may want to rethrow in CI environments.
      // eslint-disable-next-line no-console
      console.warn(`ensureIndexes: createIndexes failed for collection ${collection.collectionName}:`, err.message || err);
    }
  }
}
