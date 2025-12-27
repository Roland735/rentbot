export function sanitizeText(s) {
  return String(s || "").trim().slice(0, 500);
}

export function validatePhone(phone) {
  const p = String(phone || "").trim();
  return /^\+?\d{7,15}$/.test(p);
}

export function validateListingUpdate(field, value) {
  const allowed = new Set(["title", "suburb", "rent", "contactPhone", "text", "external_images"]);
  if (!allowed.has(field)) return false;
  if (field === "rent" && typeof value !== "number") return false;
  if (field === "external_images" && !Array.isArray(value)) return false;
  return true;
}

export function validateSearchQuery(q) {
  const s = sanitizeText(q);
  return s.length > 1;
}

