const WHATCHIMP_ACCESS_TOKEN = (process.env.WHATCHIMP_ACCESS_TOKEN || "").trim();
const WHATCHIMP_API_URL = (process.env.WHATCHIMP_API_URL || "").trim();

export async function sendWhatsApp(to, body, media = []) {
  if (!WHATCHIMP_ACCESS_TOKEN) return { ok: false, error: "Missing WHATCHIMP_ACCESS_TOKEN" };
  if (!WHATCHIMP_API_URL) return { ok: false, error: "Missing WHATCHIMP_API_URL" };

  const recipient = String(to || "").replace(/[^\d]/g, "");
  if (!recipient) return { ok: false, error: "Missing recipient phone" };

  const text = String(body || "");

  const payload =
    Array.isArray(media) && media.length > 0
      ? { number: recipient, type: "media", media_url: media[0], caption: text }
      : { number: recipient, type: "text", message: text };

  let res;
  try {
    res = await fetch(WHATCHIMP_API_URL, {
      method: "POST",
      redirect: "manual",
      headers: {
        Authorization: `Bearer ${WHATCHIMP_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    const errorText = err?.message || String(err);
    const isTls =
      errorText.includes("ERR_SSL") ||
      errorText.includes("SSL/TLS") ||
      errorText.includes("tlsv1") ||
      errorText.includes("secure channel");
    if (isTls) {
      return {
        ok: false,
        error: `TLS handshake failed calling WhatChimp (${errorText}).`
      };
    }
    return { ok: false, error: errorText };
  }

  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location") || "";
    return { ok: false, error: `WhatChimp endpoint redirected (${res.status}) to ${location || "unknown"}` };
  }

  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) return { ok: false, error: data };
  if (typeof data === "string" && data.toLowerCase().includes("<html")) {
    return { ok: false, error: "Unexpected HTML response (likely wrong endpoint)" };
  }

  return { ok: true, data, provider: "whatchimp" };
}

export function validateSignature(req) {
  return true;
}
