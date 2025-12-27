export function formatSearchResults(results, balanceAfter) {
  const lines = [];
  lines.push(`${results.length} matches (1 credit used — balance ${balanceAfter}):`);
  results.forEach((r, i) => {
    const rent = typeof r.rent === "number" ? r.rent : 0;
    lines.push(`${i + 1}. ${r.suburb || ""} — ${r.title || ""} — $${rent} — Contact: ${r.contactPhone || r.ownerPhone || ""} — ID: ${r.id || ""}`);
  });
  lines.push(`Reply PHOTOS <ID> to request images (2 credits). Reply HELP for commands.`);
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
  return `✅ Listing draft saved — ID: ${id}. To publish, reply BUY LIST ${id}. Publishing requires $3 via Paynow Express.`;
}

export function formatEditConfirmed(id, field) {
  return `Listing ${id} updated — ${field}.`;
}

export function formatReceipt(amount, reference) {
  return `✅ Payment received — $${amount} — Ref: ${reference}`;
}

