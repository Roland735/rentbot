import { updateCredits } from "@/lib/store";
import { getDb } from "@/lib/db";
import { sendWhatsApp } from "@/lib/twilio";
import { formatReceipt } from "@/lib/format";
import { logInfo, logError } from "@/lib/log";

export async function POST(req) {
  try {
    // Paynow sends x-www-form-urlencoded
    const text = await req.text();
    const params = new URLSearchParams(text);
    const body = Object.fromEntries(params.entries());

    logInfo("paynow_webhook", body);

    const { reference, status, pollurl, paynowreference, amount } = body;
    
    // Status normalization
    // Paynow statuses: Paid, Awaiting Delivery, Delivered, Created, Sent, Cancelled, Failed
    const isSuccess = status === "Paid" || status === "Awaiting Delivery" || status === "Delivered";

    const db = await getDb();
    const tx = await db.collection("transactions").findOne({ reference });

    if (!tx) {
      logError("paynow_webhook_tx_not_found", { reference });
      // Return 200 to stop Paynow from retrying if it's a garbage reference
      return new Response("Transaction not found", { status: 200 });
    }

    if (tx.status === "success") {
      return new Response("Already processed", { status: 200 });
    }

    if (isSuccess) {
      // Update transaction
      await db.collection("transactions").updateOne(
        { reference }, 
        { 
          $set: { 
            status: "success", 
            paynowReference: paynowreference,
            pollUrl: pollurl,
            updatedAt: new Date()
          } 
        }
      );

      const { phone, product, listingId } = tx;

      // Fulfill
      if (product && product.startsWith("credits_")) {
        // product format: credits_AMOUNT
        const creditsToAdd = parseInt(product.split("_")[1]);
        await updateCredits(phone, creditsToAdd);
        await sendWhatsApp(phone, formatReceipt(tx.amount, reference));
        logInfo("paynow_fulfillment_credits", { phone, creditsToAdd, reference });
      } else if (product === "listing_publish" && listingId) {
        await db.collection("listings").updateOne(
          { id: listingId }, 
          { $set: { published: true, updatedAt: new Date() } }
        );
        await sendWhatsApp(phone, `✅ *Listing Published*\n\nYour listing ${listingId} is now live!\nRef: ${reference}`);
        logInfo("paynow_fulfillment_listing", { phone, listingId, reference });
      }

    } else {
      // Update status if failed/cancelled
      await db.collection("transactions").updateOne(
        { reference }, 
        { 
          $set: { 
            status: status.toLowerCase(), 
            updatedAt: new Date() 
          } 
        }
      );
    }

    return new Response("OK", { status: 200 });

  } catch (e) {
    logError("paynow_webhook_error", e);
    return new Response("Internal Error", { status: 500 });
  }
}
