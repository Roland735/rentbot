import { updateCredits } from "@/lib/store";
import { getDb } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/paynow";
import { sendWhatsApp } from "@/lib/twilio";
import { formatReceipt } from "@/lib/format";

export async function POST(req) {
  const body = await req.json();
  const ok = await verifyWebhookSignature();
  if (!ok) return new Response("", { status: 401 });
  const db = await getDb();
  const { status, reference, phone, product, amount } = body;
  if (status === "success") {
    if (product && product.startsWith("credits_")) {
      const n = parseInt(product.split("_")[1]);
      await updateCredits(phone, n);
      await sendWhatsApp(phone, formatReceipt(amount, reference));
    }
    if (product === "listing_publish" && body.listingId) {
      await db.collection("listings").updateOne({ id: body.listingId }, { $set: { published: true, updatedAt: new Date() } });
      await sendWhatsApp(phone, `Your listing ${body.listingId} is now live. Ref: ${reference}`);
    }
    const tx = await db.collection("transactions").findOne({ reference });
    if (!tx || tx.status !== "success") {
      await db.collection("transactions").updateOne({ reference }, { $set: { status: "success", amount } });
    }
  } else {
    await db.collection("transactions").updateOne({ reference }, { $set: { status: "failed" } });
  }
  return Response.json({ ok: true });
}
