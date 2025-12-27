export async function createPush({ phone, amount, reference, callbackUrl }) {
  return { ok: true, providerRef: `mock-${Date.now()}`, reference };
}

export async function verifyWebhookSignature() {
  return true;
}

