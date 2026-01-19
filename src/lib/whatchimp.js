const WHATCHIMP_ACCESS_TOKEN = (process.env.WHATCHIMP_ACCESS_TOKEN || "").trim();
const WHATCHIMP_API_URL = (process.env.WHATCHIMP_API_URL || "").trim();

const WHATSAPP_CLOUD_ACCESS_TOKEN = (process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || "").trim();
const WHATSAPP_CLOUD_PHONE_NUMBER_ID = (process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || "").trim();

export async function sendWhatsApp(to, body, media = []) {
  const recipient = String(to || "").replace(/[^\d]/g, "");
  if (!recipient) return { ok: false, error: "Missing recipient phone" };

  const text = String(body || "");

  const tryWhatChimp = async () => {
    if (!WHATCHIMP_ACCESS_TOKEN || !WHATCHIMP_API_URL) return { ok: false, skipped: true };

    const payload =
      Array.isArray(media) && media.length > 0
        ? { number: recipient, type: "media", media_url: media[0], caption: text }
        : { number: recipient, type: "text", message: text };

    try {
      const res = await fetch(WHATCHIMP_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATCHIMP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();

      if (!res.ok) return { ok: false, error: data };

      if (typeof data === "string" && data.toLowerCase().includes("<html")) {
        return { ok: false, error: "Unexpected HTML response (likely wrong endpoint)" };
      }

      return { ok: true, data, provider: "whatchimp" };
    } catch (err) {
      return { ok: false, error: err, provider: "whatchimp" };
    }
  };

  const tryWhatsAppCloud = async () => {
    if (!WHATSAPP_CLOUD_ACCESS_TOKEN || !WHATSAPP_CLOUD_PHONE_NUMBER_ID) return { ok: false, skipped: true };
    if (Array.isArray(media) && media.length > 0) {
      return { ok: false, error: "Media not supported for WhatsApp Cloud fallback yet" };
    }

    const url = `https://graph.facebook.com/v19.0/${WHATSAPP_CLOUD_PHONE_NUMBER_ID}/messages`;
    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "text",
      text: { body: text }
    };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_CLOUD_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json") ? await res.json() : await res.text();
      if (!res.ok) return { ok: false, error: data };
      return { ok: true, data, provider: "whatsapp_cloud" };
    } catch (err) {
      return { ok: false, error: err, provider: "whatsapp_cloud" };
    }
  };

  const r1 = await tryWhatChimp();
  if (r1.ok) return r1;

  const r2 = await tryWhatsAppCloud();
  if (r2.ok) return r2;

  const errorText = (() => {
    const base = r1?.error?.message || (typeof r1?.error === "string" ? r1.error : "");
    const cloud = r2?.error?.message || (typeof r2?.error === "string" ? r2.error : "");
    const combined = [base, cloud].filter(Boolean).join(" | ");
    return combined || "Message send failed";
  })();

  const isTls =
    errorText.includes("ERR_SSL") ||
    errorText.includes("SSL/TLS") ||
    errorText.includes("tlsv1") ||
    errorText.includes("secure channel");

  if (isTls) {
    return {
      ok: false,
      error: `TLS handshake failed calling WhatChimp. This usually means WHATCHIMP_API_URL is wrong or the endpoint is misconfigured. (${errorText})`
    };
  }

  return { ok: false, error: errorText };
}

export function validateSignature(req) {
  return true;
}
