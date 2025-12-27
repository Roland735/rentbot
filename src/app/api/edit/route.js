import { getDb } from "@/lib/db";
import { sendWhatsApp } from "@/lib/twilio";
import { formatEditConfirmed } from "@/lib/format";
import { validateListingUpdate, validatePhone } from "@/lib/validate";
import { logInfo } from "@/lib/log";

export async function POST(req) {
  const { phone, id, field, value } = await req.json();
  if (!validatePhone(phone) || !validateListingUpdate(field, value)) return Response.json({ ok: false, reason: "invalid_input" }, { status: 400 });
  const db = await getDb();
  const listing = await db.collection("listings").findOne({ id });
  if (!listing || listing.ownerPhone !== phone) return Response.json({ ok: false, reason: "not_owner" }, { status: 403 });
  await db.collection("listings").updateOne({ id }, { $set: { [field]: value, updatedAt: new Date() } });
  await sendWhatsApp(phone, formatEditConfirmed(id, field));
  logInfo("edit", { phone, id, field });
  return Response.json({ ok: true });
}
