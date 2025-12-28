export function formatSearchResults(results, balanceAfter) {
  const lines = [];
  lines.push(`${results.length} matches (1 credit used — balance ${balanceAfter}):`);

  results.forEach((r, i) => {
    const rent = typeof r.rent === "number" ? r.rent : 0;
    const deposit = typeof r.deposit === "number" ? r.deposit : 0;
    const type = r.type || "Not specified";
    const desc = r.text || r.description || "No description";
    const amenities = (Array.isArray(r.amenities) && r.amenities.length > 0)
      ? r.amenities.join(", ")
      : "None listed";

    lines.push(
      `\n${i + 1}. Listing Details\n` +
      `Title: ${r.title || "Untitled"}\n` +
      `Type: ${type}\n` +
      `Address: ${r.address || r.suburb || "No address"}\n` +
      `Rent: $${rent} (Weekly)\n` +
      `Deposit: $${deposit}\n` +
      `Bedrooms: ${r.bedrooms || "N/A"}\n` +
      `Key features / Amenities: ${amenities}\n` +
      `Contact name: ${r.contactName || "Owner"}\n` +
      `Contact phone (WhatsApp): ${r.contactPhone || r.ownerPhone || ""} (ID: ${r.id})`
    );
  });

  lines.push(`\nReply with the *Listing Number* (e.g. 1) to get photos (2 credits). Reply HELP for commands.`);
  return lines.join("\n");
}

export function formatWelcome(credits) {
  return `👋 *Welcome to RentBot!*

I can help you find a place to rent or list your own property.

*How to use:*
🏠 *SEARCH* - Find a home (1 credit)
📝 *LIST* - List a property (Free to draft, $0.50 to publish)
📸 *PHOTOS* - View listing photos (2 credits)
💳 *BUY CREDITS* - Top up your account
❓ *HELP* - Show this menu

*Buying Credits:*
Reply *BUY CREDITS <amount>* to purchase.
Example: *BUY CREDITS 5* gets you $5 worth of credits.
Payment via EcoCash/OneMoney.

*Current Balance:* ${credits} credits`;
}

export function formatHelp(credits) {
  return formatWelcome(credits);
}

export function formatStop() {
  return `You have been opted out. Reply HELP to resume.`;
}

export function formatPhotosRequest(id) {
  return `Request received for ${id} — 2 credits will be charged. Reply YES to confirm or NO to cancel.`;
}

export function formatInsufficientCredits(required) {
  return `Insufficient credits — you need ${required} credits. Reply BUY <bundle>.`;
}

export function formatListingDraft(id) {
  return `✅ *Listing Draft Saved*\n\nYour listing is ready for review (ID: ${id}).\n\nReply *BUY LIST ${id}* to publish it.\n(Publishing requires $0.50 via Paynow Express)`;
}

export function formatEditConfirmed(id, field) {
  return `Listing ${id} updated — ${field}.`;
}

export function formatReceipt(amount, reference) {
  return `✅ Payment received — $${amount} — Ref: ${reference}`;
}

