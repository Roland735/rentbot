const ACCESS_TOKEN = process.env.WHATCHIMP_ACCESS_TOKEN;
const API_URL = process.env.WHATCHIMP_API_URL; // e.g., https://api.whatchimp.com/v1/send

/**
 * Sends a WhatsApp message using WhatChimp API
 * @param {string} to - The recipient's phone number (e.g., +263...)
 * @param {string} body - The text message body
 * @param {string[]} media - Array of media URLs (optional)
 */
export async function sendWhatsApp(to, body, media = []) {
  if (!ACCESS_TOKEN) {
    console.error("Missing WHATCHIMP_ACCESS_TOKEN");
    return { ok: false, error: "Missing configuration" };
  }

  // Sanitize number: remove + and spaces
  const recipient = to.replace(/[^\d]/g, "");

  // Placeholder implementation - Needs correct API Endpoint and Payload structure
  // Based on common patterns for WhatsApp wrappers:
  const payload = {
    number: recipient,
    message: body,
    type: "text"
  };

  if (media.length > 0) {
    payload.type = "media";
    payload.media_url = media[0];
    payload.caption = body;
  }

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ACCESS_TOKEN}`, // or maybe 'access_token' in query?
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("WhatChimp API Error:", data);
      return { ok: false, error: data };
    }
    return { ok: true, data };
  } catch (err) {
    console.error("WhatChimp Fetch Error:", err);
    return { ok: false, error: err.message };
  }
}

export function validateSignature(req) {
  // TODO: Implement webhook signature verification if WhatChimp provides it
  return true;
}
