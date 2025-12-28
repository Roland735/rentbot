import { ensureUser, searchListings, createPhotoRequest, getPendingPhotoRequest, updateCredits, confirmPhotoRequest, createListingDraft, createModerationTicket, getUser, setOptOut, getListingById } from "@/lib/store";
import { sendWhatsApp, sendWhatsAppFlow, validateTwilioSignature } from "@/lib/twilio";
import { formatSearchResults, formatPhotosRequest, formatInsufficientCredits, formatHelp, formatListingDraft } from "@/lib/format";
import { canSearch, recordSearch, canPhotos, recordPhotos } from "@/lib/rate";
import { sanitizeText } from "@/lib/validate";
import { logInfo } from "@/lib/log";

function parse(body) {
  const phone = (body.From || "").replace("whatsapp:", "");

  // Handle WhatsApp Flow response
  if (body.InteractionType === "nfm_reply") {
    try {
      const interactionResponse = JSON.parse(body.InteractionResponse || "{}");
      // The structure depends on Twilio's payload. Usually parsed JSON is enough if flow is simple.
      return { phone, command: "FLOW_RESPONSE", rest: interactionResponse };
    } catch (e) {
      logInfo("flow_parse_error", { error: e.message });
    }
  }

  const text = (body.Body || "").trim();
  const command = text.split(/\s+/)[0].toUpperCase();
  const rest = text.slice(command.length).trim();
  return { phone, command, rest };
}

export async function POST(req) {
  const data = await req.formData();
  const obj = Object.fromEntries([...data.entries()]);
  const signature = req.headers.get("x-twilio-signature");
  const url = `https://rentbot-self.vercel.app/api/twilio/webhook`;
  if (!validateTwilioSignature(url, obj, signature)) {
    return new Response("", { status: 401 });
  }
  const { phone, command, rest } = parse(obj);
  await ensureUser(phone);
  const user = await getUser(phone);
  if (user?.optedOut && command !== "HELP") return Response.json({ ok: true });
  if (command === "SEARCH") {
    if (!user || user.credits < 1) {
      await sendWhatsApp(phone, formatInsufficientCredits(1));
      return Response.json({ ok: true });
    }
    const rate = await canSearch(phone);
    if (!rate.ok) return Response.json({ ok: true });
    const results = await searchListings(sanitizeText(rest));
    const body = formatSearchResults(results, (user.credits || 0) - 1);
    const sendRes = await sendWhatsApp(phone, body);
    if (sendRes?.sid) {
      await updateCredits(phone, -1);
      await recordSearch(phone);
    }
    logInfo("twilio_search", { phone, results: results.length });
    return Response.json({ ok: true });
  }
  if (command === "PHOTOS") {
    const id = rest.split(/\s+/)[0];
    const rate = await canPhotos(phone);
    if (!rate.ok) return Response.json({ ok: true });
    await createPhotoRequest(phone, id);
    await sendWhatsApp(phone, formatPhotosRequest(id));
    await recordPhotos(phone);
    logInfo("twilio_photos_request", { phone, id });
    return Response.json({ ok: true });
  }
  if (command === "YES") {
    const pending = await getPendingPhotoRequest(phone);
    if (pending) {
      const listing = await getListingById(pending.listingId);
      const media = Array.isArray(listing?.external_images) ? listing.external_images.slice(0, 3) : [];
      const success = await updateCredits(phone, -2);
      if (success) {
        await confirmPhotoRequest(phone);
        await sendWhatsApp(phone, media.length ? "Photos attached." : "No images available — sending listing link.", media);
        logInfo("twilio_photos_confirm", { phone, id: pending.listingId, media: media.length });
      } else {
        await sendWhatsApp(phone, formatInsufficientCredits(2));
      }
    }
    return Response.json({ ok: true });
  }
  if (command === "REPORT") {
    const [listingId, ...rs] = rest.split(/\s+/);
    await createModerationTicket(phone, listingId, rs.join(" "));
    return Response.json({ ok: true });
  }
  if (command === "LIST") {
    const flowSid = process.env.TWILIO_FLOW_SID;
    if (flowSid) {
      await sendWhatsAppFlow(phone, flowSid, "Create Listing", "Click the button below to fill out the listing details.");
    } else {
      const listing = await createListingDraft(phone, rest);
      await sendWhatsApp(phone, formatListingDraft(listing.id));
    }
    return Response.json({ ok: true });
  }
  if (command === "FLOW_RESPONSE") {
    const listing = await createListingDraft(phone, rest);
    await sendWhatsApp(phone, formatListingDraft(listing.id));
    return Response.json({ ok: true });
  }
  if (command === "HELP") {
    await sendWhatsApp(phone, formatHelp(user?.credits ?? 0));
    return Response.json({ ok: true });
  }
  if (command === "STOP") {
    await setOptOut(phone, true);
    await sendWhatsApp(phone, "You have been opted out.");
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true });
}
