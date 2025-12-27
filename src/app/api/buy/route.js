import { addTransaction } from "@/lib/store";
import { createPush } from "@/lib/paynow";

export async function POST(req) {
  const { phone, product, amount, meta } = await req.json();
  const reference = `CRD-${Date.now()}`;
  const result = await createPush({ phone, amount, reference, callbackUrl: `${process.env.NEXT_PUBLIC_BASE_URL}/api/paynow/webhook` });
  await addTransaction({ reference, phone, product, type: product === "listing_publish" ? "listing_publish" : "credit_purchase", status: "pending", amount, providerRef: result.providerRef, meta });
  return Response.json({ ok: true, requested: true, reference });
}

