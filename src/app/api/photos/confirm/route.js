import { getPendingPhotoRequest, confirmPhotoRequest, updateCredits, getListingById } from "@/lib/store";
import { sendWhatsApp } from "@/lib/twilio";
import { formatInsufficientCredits } from "@/lib/format";
import { validatePhone } from "@/lib/validate";
import { logInfo } from "@/lib/log";

export async function POST(req) {
  const { phone } = await req.json();
  if (!validatePhone(phone)) return Response.json({ ok: false, reason: "invalid_input" }, { status: 400 });
  const pending = await getPendingPhotoRequest(phone);
  if (!pending) {
    await sendWhatsApp(phone, "No pending photo request.");
    return Response.json({ ok: false, reason: "no_pending" }, { status: 404 });
  }
  const listing = await getListingById(pending.listingId);
  const media = Array.isArray(listing?.external_images) ? listing.external_images.slice(0, 3) : [];
  if (!(await updateCredits(phone, -2))) {
    await sendWhatsApp(phone, formatInsufficientCredits(2));
    return Response.json({ ok: false, reason: "insufficient_credits" }, { status: 402 });
  }
  await confirmPhotoRequest(phone);
  const body = media.length ? "Photos attached." : "No images available — sending listing link.";
  const sendRes = await sendWhatsApp(phone, body, media);
  logInfo("photos_confirm", { phone, listingId: pending.listingId, sent: !!sendRes?.sid });
  return Response.json({ ok: true, sent: !!sendRes?.sid });
}
