import { Paynow } from "paynow";
import { logInfo, logError } from "./log";

const PAYNOW_INTEGRATION_ID = (process.env.PAYNOW_INTEGRATION_ID || process.env.PAYNOW_API_KEY || "").trim();
const PAYNOW_INTEGRATION_KEY = (process.env.PAYNOW_INTEGRATION_KEY || process.env.PAYNOW_API_SECRET || "").trim();
const PAYNOW_EMAIL = (process.env.PAYNOW_EMAIL || "customer@rentbot.co.zw").trim();
const TEST_MODE = String(process.env.PAYNOW_TEST_MODE || "").toLowerCase() === "true";
const BASE_URL = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").trim();

// Debug log to verify credentials
console.log('[Paynow] Initializing with ID:', PAYNOW_INTEGRATION_ID);

if (!PAYNOW_INTEGRATION_ID || !PAYNOW_INTEGRATION_KEY) {
  throw new Error("Paynow credentials missing. Please check .env.local and restart server.");
}

// Ensure these are set in production
const paynow = new Paynow(PAYNOW_INTEGRATION_ID, PAYNOW_INTEGRATION_KEY);

paynow.resultUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/paynow/webhook`;
paynow.returnUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/payment-success`;

export async function createPush({ phone, amount, reference, email }) {
  // Use provided email or fallback to environment email (essential for Test Mode)
  const authEmail = email || PAYNOW_EMAIL;

  try {
    const payment = paynow.createPayment(reference, authEmail);
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

    if (TEST_MODE) {
      const simulate = async (status, delayMs) => {
        try {
          const form = new URLSearchParams({
            reference,
            status,
            pollurl: `TEST-${reference}`,
            paynowreference: `TEST-${reference}`,
            amount: String(amount)
          });
          setTimeout(async () => {
            try {
              const res = await fetch(`${BASE_URL}/api/paynow/webhook`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: form.toString()
              });
              logInfo("paynow_test_webhook_sent", { reference, status, ok: res.ok });
            } catch (err) {
              logError("paynow_test_webhook_error", { reference, status, error: err?.message || String(err) });
            }
          }, delayMs);
        } catch (err) {
          logError("paynow_test_prepare_error", { reference, status, error: err?.message || String(err) });
        }
      };

      if (mobileNumber === "0771111111") {
        await simulate("Paid", 5000);
        return { ok: true, providerRef: `TEST-${reference}`, instructions: "Simulated SUCCESS in 5s" };
      }
      if (mobileNumber === "0772222222") {
        await simulate("Paid", 30000);
        return { ok: true, providerRef: `TEST-${reference}`, instructions: "Simulated SUCCESS in 30s" };
      }
      if (mobileNumber === "0773333333") {
        await simulate("Failed", 30000);
        return { ok: true, providerRef: `TEST-${reference}`, instructions: "Simulated FAILED in 30s" };
      }
      if (mobileNumber === "0774444444") {
        return { ok: false, error: "Insufficient balance" };
      }
      // If in TEST_MODE but number isn't one of the special cases, fall through to real API.
    }

    // The 'paynow' package might have a bug where response.error is sometimes undefined or an object
    // when using sendMobile, OR it's failing internally.
    // However, looking at the error "Cannot read properties of undefined (reading 'toLowerCase')",
    // this often happens inside the 'paynow' library if it tries to parse a response or check a property.
    // It usually means the HTTP request failed or returned unexpected data.
    // 
    // Fix: Ensure method is lower case string just in case, though we set it manually above.
    // Also, ensure email is a string.

    const response = await paynow.sendMobile(payment, mobileNumber, method);

    if (response && response.success) {
      logInfo("paynow_success", { pollUrl: response.pollUrl, instructions: response.instructions });
      return { ok: true, providerRef: response.pollUrl, instructions: response.instructions };
    } else {
      const errorMsg = response ? response.error : "Unknown error from Paynow";
      logError("paynow_fail", errorMsg);
      return { ok: false, error: errorMsg };
    }
  } catch (e) {
    logError("paynow_exception", e);
    // Return a safe error string even if e is weird
    return { ok: false, error: e.message || "Internal Paynow Error" };
  }
}

export async function verifyWebhookSignature() {
  // Paynow IP whitelist check or poll verification could go here.
  // For now, we trust the POST if the status is valid, 
  // but in production, we should poll the status from Paynow using the pollUrl (stored in providerRef).
  return true;
}

