import { ensureUser, searchListings, createPhotoRequest, getPendingPhotoRequest, updateCredits, confirmPhotoRequest, createListingDraft, createModerationTicket, getUser, setOptOut, getListingById, setUserDraftState, clearUserDraftState, updateListingDraft } from "@/lib/store";
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
    // If we have a Flow SID, try to use it.
    const flowSid = process.env.TWILIO_FLOW_SID;
    if (flowSid) {
      await sendWhatsAppFlow(phone, flowSid, "Create Listing", "Click the button below to fill out the listing details.");
      return Response.json({ ok: true });
    }

    // Try to parse "One-Shot" input if the user provided arguments
    // Format: LIST Title, Suburb, Rent, Type, Description
    if (rest.length > 5 && (rest.includes(",") || rest.includes("\n"))) {
      const parts = rest.split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 0);
      if (parts.length >= 4) {
        // Assume order: Title, Suburb, Rent, Type, Description (optional)
        const [title, suburb, rentStr, type, ...descParts] = parts;
        const rent = parseFloat(rentStr.replace(/[^0-9.]/g, ""));
        const description = descParts.join(" ");

        if (!isNaN(rent)) {
          const listing = await createListingDraft(phone, {
            title, suburb, rent, type, description: description || title
          });
          await sendWhatsApp(phone, formatListingDraft(listing.id));
          return Response.json({ ok: true });
        }
      }
    }

    // Start conversational flow
    // 1. Create a blank draft
    const listing = await createListingDraft(phone, {});
    // 2. Set user state to asking for input
    await setUserDraftState(phone, "asking_details_or_step", listing.id);
    // 3. Ask question
    await sendWhatsApp(phone, "To list quickly, reply with details in this format:\n*Title, Suburb, Rent, Type, Description*\n\nExample:\n*2BR Flat, Avondale, 300, Apartment, Nice view*\n\nOr reply *STEP* to answer one by one.");
    logInfo("twilio_list_start", { phone, draftId: listing.id });
    return Response.json({ ok: true });
  }

  if (command === "STOP") {
    await setOptOut(phone, true);
    // Also clear any draft state
    await clearUserDraftState(phone);
    await sendWhatsApp(phone, "You have been opted out.");
    return Response.json({ ok: true });
  }

  // Handle Conversational States
  if (user?.draftStatus && user?.currentDraftId) {
    const draftId = user.currentDraftId;
    const text = (obj.Body || "").trim();

    // Allow user to cancel
    if (text.toUpperCase() === "CANCEL") {
      await clearUserDraftState(phone);
      await sendWhatsApp(phone, "Listing creation canceled.");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_details_or_step") {
      if (text.toUpperCase() === "STEP") {
        await setUserDraftState(phone, "asking_title", draftId);
        await sendWhatsApp(phone, "Step 1/5: Title\nWhat is the *Title* of your listing?\n(e.g. Modern 2 Bedroom Apartment)");
        return Response.json({ ok: true });
      } else {
        // Try to parse as One-Shot
        const parts = text.split(/[,;\n]+/).map(s => s.trim()).filter(s => s.length > 0);
        if (parts.length >= 4) {
          const [title, suburb, rentStr, type, ...descParts] = parts;
          const rent = parseFloat(rentStr.replace(/[^0-9.]/g, ""));
          const description = descParts.join(" ");

          if (!isNaN(rent)) {
            await updateListingDraft(draftId, {
              title, suburb, rent, type, description: description || title, text: description || title
            });
            await clearUserDraftState(phone);
            await sendWhatsApp(phone, formatListingDraft(draftId));
            return Response.json({ ok: true });
          }
        }
        // If parsing failed
        await sendWhatsApp(phone, "I couldn't understand that format. Please reply *STEP* to do it one by one, or try sending the format again: *Title, Suburb, Rent, Type, Description*");
        return Response.json({ ok: true });
      }
    }

    if (user.draftStatus === "asking_title") {
      await updateListingDraft(draftId, { title: text });
      await setUserDraftState(phone, "asking_suburb", draftId);
      await sendWhatsApp(phone, "Step 2/5: Location\nWhich *Suburb* is the property located in?\n(e.g. Avondale, CBD, Borrowdale)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_suburb") {
      await updateListingDraft(draftId, { suburb: text });
      await setUserDraftState(phone, "asking_rent", draftId);
      await sendWhatsApp(phone, "Step 3/5: Price\nWhat is the *Weekly Rent* in USD?\n(Please enter a number only, e.g. 300)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_rent") {
      const rent = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(rent)) {
        await sendWhatsApp(phone, "Please enter a valid number for rent.");
        return Response.json({ ok: true });
      }
      await updateListingDraft(draftId, { rent });
      await setUserDraftState(phone, "asking_type", draftId);
      await sendWhatsApp(phone, "Step 4/5: Type\nWhat *Type* of property is it?\n(e.g. Apartment, House, Shop, Office)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_type") {
      await updateListingDraft(draftId, { type: text });
      await setUserDraftState(phone, "asking_description", draftId);
      await sendWhatsApp(phone, "Step 5/5: Description\nFinally, provide a *Description* (Amenities, key features, etc.):");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_description") {
      // Split description and try to extract amenities if provided in comma separated list within description
      // For now, we just treat it as one text block, but we could parse it more intelligently.
      // But the user asked for detail. Let's ask for amenities separately to ensure high detail.

      await updateListingDraft(draftId, { text: text, description: text });
      await setUserDraftState(phone, "asking_amenities", draftId);
      await sendWhatsApp(phone, "Step 6/6: Amenities\nList the *Amenities* separated by commas (e.g. WiFi, Pool, Solar, Borehole). If none, reply *NONE*.");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_amenities") {
      let amenities = [];
      if (text.toUpperCase() !== "NONE") {
        amenities = text.split(",").map(s => s.trim()).filter(s => s.length > 0);
      }

      await updateListingDraft(draftId, { amenities });
      await clearUserDraftState(phone);
      await sendWhatsApp(phone, formatListingDraft(draftId));
      return Response.json({ ok: true });
    }
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
  return Response.json({ ok: true });
}
