import { createPhotoRequest } from "@/lib/store";
import { sendWhatsApp } from "@/lib/twilio";
import { formatPhotosRequest } from "@/lib/format";
import { canPhotos, recordPhotos } from "@/lib/rate";
import { validatePhone } from "@/lib/validate";
import { logInfo } from "@/lib/log";

export async function POST(req) {
  const { phone, listingId } = await req.json();
  if (!validatePhone(phone)) return Response.json({ ok: false, reason: "invalid_input" }, { status: 400 });
  const rate = await canPhotos(phone);
  if (!rate.ok) return Response.json({ ok: false, reason: rate.reason }, { status: 429 });
  const pr = await createPhotoRequest(phone, listingId);
  await sendWhatsApp(phone, formatPhotosRequest(listingId));
  await recordPhotos(phone);
  logInfo("photos_request", { phone, listingId });
  return Response.json({ ok: true, request: pr });
}
