import Twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

let client;
function getClient() {
    if (!client) client = Twilio(accountSid, authToken);
    return client;
}

export async function sendWhatsApp(to, body, media = []) {
    const client = getClient();
    const params = { from, to: `whatsapp:${to}`, body };
    if (media && media.length) params.mediaUrl = media;
    return client.messages.create(params);
}

export async function sendWhatsAppFlow(to, flowSid, flowCta, body) {
    const client = getClient();
    // Using Twilio Content API (Templates) is the standard way for Flows
    // flowSid should be the Content SID (HX...) associated with the Flow
    const params = {
        from,
        to: `whatsapp:${to}`,
        contentSid: flowSid,
        contentVariables: JSON.stringify({
            1: body // Assuming the template has {{1}} for the body text
        })
    };
    return client.messages.create(params);
}

export function validateTwilioSignature(url, params, signature) {
    return Twilio.validateRequest(authToken, signature, url, params);
}

