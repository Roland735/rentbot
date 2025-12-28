export function formatSearchResults(results, balanceAfter) {
  const lines = [];
  lines.push(`${results.length} matches (1 credit used — balance ${balanceAfter}):`);

  results.forEach((r, i) => {
    const rent = typeof r.rent === "number" ? r.rent : 0;
    const type = r.type || "Not specified";
    const desc = r.text || r.description || "No description";
    const amenities = (Array.isArray(r.amenities) && r.amenities.length > 0)
      ? `\nAmenities: ${r.amenities.join(", ")}`
      : "";

    lines.push(
      `\n${i + 1}. Listing Details\n` +
      `Title: ${r.title || "Untitled"}\n` +
      `Suburb: ${r.suburb || "No location"}\n` +
      `Rent: $${rent} (Weekly)\n` +
      `Type: ${type}\n` +
      `Description: ${desc}${amenities}\n` +
      `Contact: ${r.contactPhone || r.ownerPhone || ""} (ID: ${r.id})`
    );
  });

  lines.push(`\nReply PHOTOS <ID> to request images (2 credits). Reply HELP for commands.`);
  return lines.join("\n");
}

export function formatHelp(credits) {
  return `RentBot — Commands:\nSEARCH <criteria> (1 credit)\nPHOTOS <ID> (2 credits, confirm YES)\nLIST <text>\nEDIT <id> <field> <value>\nBUY <bundle>\nHELP\nSTOP\nCredits: ${credits}`;
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
  return `✅ *Listing Draft Saved*\n\nYour listing is ready for review (ID: ${id}).\n\nReply *BUY LIST ${id}* to publish it.\n(Publishing requires $3 via Paynow Express)`;
}

export function formatEditConfirmed(id, field) {
  return `Listing ${id} updated — ${field}.`;
}

export function formatReceipt(amount, reference) {
  return `✅ Payment received — $${amount} — Ref: ${reference}`;
}

