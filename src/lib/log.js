function redact(obj) {
  const o = JSON.parse(JSON.stringify(obj || {}));
  if (o.TWILIO_AUTH_TOKEN) o.TWILIO_AUTH_TOKEN = "[redacted]";
  if (o.PAYNOW_API_KEY) o.PAYNOW_API_KEY = "[redacted]";
  if (o.PAYNOW_API_SECRET) o.PAYNOW_API_SECRET = "[redacted]";
  return o;
}

export function logInfo(event, payload) {
  try {
    console.log(JSON.stringify({ level: "info", event, payload }, null, 0));
  } catch {}
}

export function logError(event, error, payload) {
  try {
    console.error(JSON.stringify({ level: "error", event, error: String(error?.message || error), payload: redact(payload) }, null, 0));
  } catch {}
}

