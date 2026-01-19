const ACCESS_TOKEN = (process.env.WHATCHIMP_ACCESS_TOKEN || "").trim();
const API_URL = (process.env.WHATCHIMP_API_URL || "").trim();

export async function sendWhatsApp(to, body, media = []) {
  if (!ACCESS_TOKEN) return { ok: false, error: "Missing WHATCHIMP_ACCESS_TOKEN" };
  if (!API_URL) return { ok: false, error: "Missing WHATCHIMP_API_URL" };

  const recipient = String(to || "").replace(/[^\d]/g, "");
  if (!recipient) return { ok: false, error: "Missing recipient phone" };

  const text = String(body || "");

  const payload =
    Array.isArray(media) && media.length > 0
      ? { number: recipient, type: "media", media_url: media[0], caption: text }
      : { number: recipient, type: "text", message: text };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      console.error("WhatChimp API Error:", data);
      return { ok: false, error: data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("WhatChimp Fetch Error:", err);
    return { ok: false, error: err?.message || String(err) };
  }
}

export function validateSignature(req) {
  return true;
}
