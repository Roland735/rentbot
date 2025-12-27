import { createListingDraft } from "@/lib/store";
import { sendWhatsApp } from "@/lib/twilio";
import { formatListingDraft } from "@/lib/format";

export async function POST(req) {
  const { phone, text } = await req.json();
  const listing = await createListingDraft(phone, text);
  await sendWhatsApp(phone, formatListingDraft(listing.id));
  return Response.json({ ok: true, listing });
}
