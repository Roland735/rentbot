import { Paynow } from "paynow";
import { logInfo, logError } from "./log";

const PAYNOW_INTEGRATION_ID = process.env.PAYNOW_INTEGRATION_ID;
const PAYNOW_INTEGRATION_KEY = process.env.PAYNOW_INTEGRATION_KEY;

// Ensure these are set in production
const paynow = new Paynow(PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY);

paynow.resultUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/paynow/webhook`;
paynow.returnUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success`;

export async function createPush({ phone, amount, reference, email = "customer@rentbot.co.zw" }) {
  try {
    const payment = paynow.createPayment(reference, email);
    payment.add("RentBot Service", amount);

    // Sanitize phone for Ecocash/OneMoney
    // Paynow expects 077... or 071... format usually
    let mobileNumber = phone.replace(/^\+263/, "0").replace(/\s+/g, "");

    // Basic validation for Zimbabwe mobile numbers
    if (!/^07\d{8}$/.test(mobileNumber)) {
      return { ok: false, error: "Invalid mobile number. Must be a Zimbabwe Ecocash or OneMoney number (07...)." };
    }

    // Auto-detect method? ecocash or onemoney
    let method = "ecocash";
    if (mobileNumber.startsWith("071")) method = "onemoney";

    logInfo("paynow_init", { reference, amount, phone: mobileNumber, method });

    const response = await paynow.sendMobile(payment, mobileNumber, method);

    if (response.success) {
      logInfo("paynow_success", { pollUrl: response.pollUrl, instructions: response.instructions });
      return { ok: true, providerRef: response.pollUrl, instructions: response.instructions };
    } else {
      logError("paynow_fail", response.error);
      return { ok: false, error: response.error };
    }
  } catch (e) {
    logError("paynow_exception", e);
    return { ok: false, error: e.message };
  }
}

export async function verifyWebhookSignature() {
  // Paynow IP whitelist check or poll verification could go here.
  // For now, we trust the POST if the status is valid, 
  // but in production, we should poll the status from Paynow using the pollUrl (stored in providerRef).
  return true;
}

