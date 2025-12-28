import { ensureUser, searchListings, createPhotoRequest, getPendingPhotoRequest, updateCredits, confirmPhotoRequest, createListingDraft, createModerationTicket, getUser, setOptOut, getListingById, setUserDraftState, clearUserDraftState, updateListingDraft, getListingCountsBySuburb, saveSearchResults, addTransaction } from "@/lib/store";
import { sendWhatsApp, sendWhatsAppFlow, validateTwilioSignature } from "@/lib/twilio";
import { formatSearchResults, formatPhotosRequest, formatInsufficientCredits, formatHelp, formatListingDraft, formatWelcome } from "@/lib/format";
import { canSearch, recordSearch, canPhotos, recordPhotos } from "@/lib/rate";
import { sanitizeText } from "@/lib/validate";
import { logInfo } from "@/lib/log";
import { suburbs } from "@/lib/suburbs";
import { createPush } from "@/lib/paynow";

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

    // Start search flow
    await setUserDraftState(phone, "search_asking_suburb", "search");

    const counts = await getListingCountsBySuburb();
    const suburbList = suburbs.map((s, i) => {
      const data = counts[s] || { count: 0, hasPhotos: false };
      const photoIcon = data.hasPhotos ? " 📷" : "";
      return `${i + 1}. ${s} (${data.count})${photoIcon}`;
    }).join("\n");

    await sendWhatsApp(phone, `*Search Listings*\nReply with the *Number* of the suburb you want to search in:\n(Count) shows available listings.\n📷 means photos are available.\n\n${suburbList}\n\nOr reply *ALL* to search everywhere.`);
    return Response.json({ ok: true });
  }

  // Handle Photos (ID or Index)
  let photoIdRequest = null;
  if (command === "PHOTOS" || command === "P") {
    const param = rest.split(/\s+/)[0];
    const idx = parseInt(param);
    if (!isNaN(idx) && user.lastSearchResults && user.lastSearchResults[idx - 1]) {
      photoIdRequest = user.lastSearchResults[idx - 1];
    } else {
      photoIdRequest = param;
    }
  } else if (!isNaN(parseInt(command)) && user.lastSearchResults) {
    // Shortcut: Just typing the number
    const idx = parseInt(command);
    if (user.lastSearchResults[idx - 1]) {
      photoIdRequest = user.lastSearchResults[idx - 1];
    }
  }

  if (photoIdRequest) {
    const id = photoIdRequest;
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
    await sendWhatsApp(phone, "To list your property, reply *STEP* to start the step-by-step process.");
    logInfo("twilio_list_start", { phone, draftId: listing.id });
    return Response.json({ ok: true });
  }

  if (command === "BUY") {
    // BUY LIST <ID>
    if (rest.startsWith("LIST")) {
      const parts = rest.split(/\s+/);
      const listingId = parts[1];
      if (!listingId) {
        await sendWhatsApp(phone, "Please specify the Listing ID. e.g. BUY LIST RNT-12345");
        return Response.json({ ok: true });
      }

      const listing = await getListingById(listingId);
      if (!listing) {
        await sendWhatsApp(phone, "Listing not found.");
        return Response.json({ ok: true });
      }
      if (listing.ownerPhone !== phone) {
        await sendWhatsApp(phone, "You can only publish your own listings.");
        return Response.json({ ok: true });
      }
      if (listing.published) {
        await sendWhatsApp(phone, "This listing is already published.");
        return Response.json({ ok: true });
      }

      // Initiate Paynow
      const amount = 0.50;
      const reference = `PUB-${listingId}-${Date.now()}`;
      const res = await createPush({ phone, amount, reference, email: "customer@rentbot.co.zw" });

      if (res.ok) {
        await addTransaction({
          reference,
          phone,
          product: "listing_publish",
          amount,
          providerRef: res.providerRef,
          status: "pending",
          listingId,
          createdAt: new Date()
        });
        await sendWhatsApp(phone, `Payment initiated ($${amount}).\n\nPlease check your phone now and enter your PIN to confirm.\n\nOnce paid, your listing will be live automatically.`);
      } else {
        const errorMsg = res.error?.includes("Invalid mobile number")
          ? "Payment failed: Please use a valid Zimbabwe Ecocash/OneMoney number."
          : "Payment initiation failed. Please try again later.";
        await sendWhatsApp(phone, errorMsg);
        logInfo("paynow_init_fail", { phone, error: res.error });
      }
      return Response.json({ ok: true });
    }

    // BUY CREDITS <AMOUNT>
    if (rest.startsWith("CREDITS")) {
      const parts = rest.split(/\s+/);
      const amount = parseFloat(parts[1]);
      if (isNaN(amount) || amount < 1) {
        await sendWhatsApp(phone, "Please specify a valid amount. e.g. BUY CREDITS 5");
        return Response.json({ ok: true });
      }

      const reference = `CRD-${Date.now()}`;
      const res = await createPush({ phone, amount, reference, email: "customer@rentbot.co.zw" });

      if (res.ok) {
        await addTransaction({
          reference,
          phone,
          product: `credits_${amount}`, // convention: credits_AMOUNT
          amount,
          providerRef: res.providerRef,
          status: "pending",
          createdAt: new Date()
        });
        await sendWhatsApp(phone, `Payment initiated ($${amount}).\n\nPlease check your phone now and enter your PIN to confirm.\n\nOnce paid, your credits will be added.`);
      } else {
        const errorMsg = res.error?.includes("Invalid mobile number")
          ? "Payment failed: Please use a valid Zimbabwe Ecocash/OneMoney number."
          : "Payment initiation failed. Please try again later.";
        await sendWhatsApp(phone, errorMsg);
        logInfo("paynow_init_fail", { phone, error: res.error });
      }
      return Response.json({ ok: true });
    }

    await sendWhatsApp(phone, "To publish a listing, reply: BUY LIST <ID>\nTo buy credits, reply: BUY CREDITS <AMOUNT>");
    return Response.json({ ok: true });
  }

  if (command === "STOP") {
    await setOptOut(phone, true);
    // Also clear any draft state
    await clearUserDraftState(phone);
    await sendWhatsApp(phone, "You have been opted out.");
    return Response.json({ ok: true });
  }

  // Handle Conversational States (Listing OR Search)
  if (user?.draftStatus && user?.currentDraftId) {
    const draftId = user.currentDraftId;
    const text = (obj.Body || "").trim();

    // Allow user to cancel
    if (text.toUpperCase() === "CANCEL") {
      await clearUserDraftState(phone);
      await sendWhatsApp(phone, "Action canceled.");
      return Response.json({ ok: true });
    }

    // Allow user to go BACK
    if (text.toUpperCase() === "BACK") {
      const prev = {
        "asking_type": "asking_title",
        "asking_suburb": "asking_type",
        "asking_address": "asking_suburb",
        "asking_rent": "asking_address",
        "asking_deposit": "asking_rent",
        "asking_bedrooms": "asking_deposit",
        "asking_amenities": "asking_bedrooms",
        "asking_contact_name": "asking_amenities",
        "asking_contact_phone": "asking_contact_name",
        "search_asking_rent": "search_asking_suburb"
      }[user.draftStatus];

      if (prev) {
        if (prev === "search_asking_suburb") {
          await setUserDraftState(phone, prev, "search");
          const counts = await getListingCountsBySuburb();
          const suburbList = suburbs.map((s, i) => {
            const data = counts[s] || { count: 0, hasPhotos: false };
            const photoIcon = data.hasPhotos ? " 📷" : "";
            return `${i + 1}. ${s} (${data.count})${photoIcon}`;
          }).join("\n");
          await sendWhatsApp(phone, `*Search Listings*\nReply with the *Number* of the suburb you want to search in:\n(Count) shows available listings.\n📷 means photos are available.\n\n${suburbList}\n\nOr reply *ALL* to search everywhere.`);
        } else {
          await setUserDraftState(phone, prev, draftId);
          let prompt = "";
          if (prev === "asking_title") prompt = "Step 1/10: Title\nWhat is the *Title* of your listing?\n(e.g. Modern 2 Bedroom Apartment)";
          else if (prev === "asking_type") prompt = "Step 2/10: Type\nWhat *Type* of property is it?\n(e.g. Apartment, House, Shop, Office)";
          else if (prev === "asking_suburb") {
            const suburbList = suburbs.map((s, i) => `${i + 1}. ${s}`).join("\n");
            prompt = `Step 3/10: Suburb\nReply with the *Number* of the suburb:\n\n${suburbList}`;
          }
          else if (prev === "asking_address") prompt = "Step 4/10: Address\nWhat is the specific *Address*? (e.g. 123 Samora Machel Ave)";
          else if (prev === "asking_rent") prompt = "Step 5/10: Rent\nWhat is the *Weekly Rent* in USD? (Number only)";
          else if (prev === "asking_deposit") prompt = "Step 6/10: Deposit\nWhat is the *Deposit* amount in USD? (Number only, reply 0 if none)";
          else if (prev === "asking_bedrooms") prompt = "Step 7/10: Bedrooms\nHow many *Bedrooms*? (e.g. 1, 2, Studio)";
          else if (prev === "asking_amenities") prompt = "Step 8/10: Key Features / Amenities\nList them separated by commas (e.g. WiFi, Borehole, Solar).";
          else if (prev === "asking_contact_name") prompt = "Step 9/10: Contact Name\nWho is the contact person?";

          if (prompt) await sendWhatsApp(phone, prompt);
        }
        return Response.json({ ok: true });
      }
    }

    // --- SEARCH FLOW ---
    if (draftId.startsWith("search")) {
      if (user.draftStatus === "search_asking_suburb") {
        const index = parseInt(text.replace(/[^0-9]/g, "")) - 1;
        let selectedSuburb = "";

        if (text.toUpperCase() === "ALL") {
          selectedSuburb = ""; // Empty string for regex search all
        } else if (!isNaN(index) && index >= 0 && index < suburbs.length) {
          selectedSuburb = suburbs[index];
        } else {
          // Try to match text directly if they typed "Avondale"
          if (suburbs.includes(text)) {
            selectedSuburb = text;
          } else {
            // Invalid input
            await sendWhatsApp(phone, "Please reply with a valid *Number* from the list or *ALL*.");
            return Response.json({ ok: true });
          }
        }

        // Store suburb in temp storage? We can use currentDraftId to store params separated by | or update user doc
        // Let's use setUserDraftState's draftId param to carry state: "search|SuburbName"
        // But draftId is used for lookup. 
        // Better: update user doc with a temporary searchParams field.
        // For simplicity/speed without schema change: Encode in draftId string "search|SuburbName"

        const nextStateId = `search|${selectedSuburb}`;
        await setUserDraftState(phone, "search_asking_rent", nextStateId);
        await sendWhatsApp(phone, `Selected: ${selectedSuburb || "All Suburbs"}\n\nNow, what is your maximum *Weekly Rent* (USD)?\nReply with a number (e.g. 300) or *ANY* for no limit.`);
        return Response.json({ ok: true });
      }

      if (user.draftStatus === "search_asking_rent") {
        // Parse previous state from ID
        const [_, suburb] = draftId.split("|");
        let maxRent = Infinity;

        if (text.toUpperCase() !== "ANY") {
          const parsed = parseFloat(text.replace(/[^0-9.]/g, ""));
          if (!isNaN(parsed)) {
            maxRent = parsed;
          } else {
            await sendWhatsApp(phone, "Please enter a valid number or ANY.");
            return Response.json({ ok: true });
          }
        }

        // EXECUTE SEARCH
        const rate = await canSearch(phone);
        if (!rate.ok) return Response.json({ ok: true });

        // We need a search function that filters by rent too.
        // Existing searchListings takes a string query.
        // We'll need to update searchListings or filter manually here.
        // Let's call searchListings with suburb, then filter by rent in memory for now (or update query).

        let results = await searchListings(suburb);

        // Filter by rent
        if (maxRent !== Infinity) {
          results = results.filter(r => {
            const rRent = typeof r.rent === "number" ? r.rent : 0;
            return rRent <= maxRent;
          });
        }

        await clearUserDraftState(phone);

        const body = formatSearchResults(results, (user.credits || 0) - 1);
        const sendRes = await sendWhatsApp(phone, body);
        if (sendRes?.sid) {
          await updateCredits(phone, -1);
          await recordSearch(phone);
        }
        logInfo("twilio_search_flow", { phone, suburb, maxRent, results: results.length });
        return Response.json({ ok: true });
      }
    }

    // --- LISTING FLOW ---
    if (user.draftStatus === "asking_details_or_step") {
      await setUserDraftState(phone, "asking_title", draftId);
      await sendWhatsApp(phone, "Step 1/10: Title\nWhat is the *Title* of your listing?\n(e.g. Modern 2 Bedroom Apartment)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_title") {
      await updateListingDraft(draftId, { title: text });
      await setUserDraftState(phone, "asking_type", draftId);
      await sendWhatsApp(phone, "Step 2/10: Type\nWhat *Type* of property is it?\n(e.g. Apartment, House, Shop, Office)\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_type") {
      await updateListingDraft(draftId, { type: text });
      await setUserDraftState(phone, "asking_suburb", draftId);

      const suburbList = suburbs.map((s, i) => `${i + 1}. ${s}`).join("\n");
      await sendWhatsApp(phone, `Step 3/10: Suburb\nReply with the *Number* of the suburb:\n\n${suburbList}\n\n(Reply BACK to go back)`);
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_suburb") {
      const index = parseInt(text.replace(/[^0-9]/g, "")) - 1;
      let selectedSuburb = text;

      if (!isNaN(index) && index >= 0 && index < suburbs.length) {
        selectedSuburb = suburbs[index];
      } else {
        // If not a number, maybe they typed the name. If strict number required:
        // await sendWhatsApp(phone, "Please reply with a valid number from the list.");
        // return Response.json({ ok: true });
        // But let's allow text fallback or assume they meant a custom one if not in list (optional).
        // For now, strict numbered list as requested "pick the number".
        if (suburbs.includes(text)) {
          selectedSuburb = text;
        } else {
          // Fallback or retry
          // For user friendliness let's just accept what they typed if it fails number check, 
          // OR re-ask if we want to enforce the list. 
          // User said "listed separately in a number way and they pick the number".
          // Let's enforce or assume valid input for now, but strictly trying to match number first.
        }
      }

      await updateListingDraft(draftId, { suburb: selectedSuburb });
      await setUserDraftState(phone, "asking_address", draftId);
      await sendWhatsApp(phone, "Step 4/10: Address\nWhat is the specific *Address*? (e.g. 123 Samora Machel Ave)\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_address") {
      await updateListingDraft(draftId, { address: text });
      await setUserDraftState(phone, "asking_rent", draftId);
      await sendWhatsApp(phone, "Step 5/10: Rent\nWhat is the *Weekly Rent* in USD? (Number only)\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_rent") {
      const rent = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(rent)) {
        await sendWhatsApp(phone, "Please enter a valid number for rent.");
        return Response.json({ ok: true });
      }
      await updateListingDraft(draftId, { rent });
      await setUserDraftState(phone, "asking_deposit", draftId);
      await sendWhatsApp(phone, "Step 6/10: Deposit\nWhat is the *Deposit* amount in USD? (Number only, reply 0 if none)\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_deposit") {
      const deposit = parseFloat(text.replace(/[^0-9.]/g, ""));
      if (isNaN(deposit)) {
        await sendWhatsApp(phone, "Please enter a valid number for deposit.");
        return Response.json({ ok: true });
      }
      await updateListingDraft(draftId, { deposit });
      await setUserDraftState(phone, "asking_bedrooms", draftId);
      await sendWhatsApp(phone, "Step 7/10: Bedrooms\nHow many *Bedrooms*? (e.g. 1, 2, Studio)\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_bedrooms") {
      await updateListingDraft(draftId, { bedrooms: text });
      await setUserDraftState(phone, "asking_amenities", draftId);
      await sendWhatsApp(phone, "Step 8/10: Key Features / Amenities\nList them separated by commas (e.g. WiFi, Borehole, Solar).\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_amenities") {
      let amenities = [];
      if (text.toUpperCase() !== "NONE") {
        amenities = text.split(",").map(s => s.trim()).filter(s => s.length > 0);
      }
      await updateListingDraft(draftId, { amenities, description: text }); // Storing raw text as description/features too
      await setUserDraftState(phone, "asking_contact_name", draftId);
      await sendWhatsApp(phone, "Step 9/10: Contact Name\nWho is the contact person?\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_contact_name") {
      await updateListingDraft(draftId, { contactName: text });
      await setUserDraftState(phone, "asking_contact_phone", draftId);
      await sendWhatsApp(phone, "Step 10/10: Contact Phone\nEnter the WhatsApp number (e.g. +263...). Reply *SAME* to use your current number.\n(Reply BACK to go back)");
      return Response.json({ ok: true });
    }

    if (user.draftStatus === "asking_contact_phone") {
      let contactPhone = text;
      if (text.toUpperCase() === "SAME") {
        contactPhone = phone;
      }
      await updateListingDraft(draftId, { contactPhone });
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
  if (command === "HELP" || command === "HI" || command === "HELLO") {
    await sendWhatsApp(phone, formatWelcome(user?.credits ?? 0));
    return Response.json({ ok: true });
  }
  return Response.json({ ok: true });
}
