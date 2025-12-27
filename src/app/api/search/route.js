import { ensureUser, searchListings, updateCredits, getUser } from "@/lib/store";
import { sendWhatsApp } from "@/lib/twilio";
import { formatSearchResults } from "@/lib/format";
import { canSearch, recordSearch } from "@/lib/rate";
import { validatePhone, validateSearchQuery } from "@/lib/validate";
import { logInfo } from "@/lib/log";

export async function POST(req) {
  const { phone, query } = await req.json();
  if (!validatePhone(phone) || !validateSearchQuery(query)) return Response.json({ ok: false, reason: "invalid_input" }, { status: 400 });
  await ensureUser(phone);
  const user = await getUser(phone);
  if (!user || user.credits < 1) return Response.json({ ok: false, reason: "insufficient_credits" }, { status: 402 });
  const rate = await canSearch(phone);
  if (!rate.ok) return Response.json({ ok: false, reason: rate.reason }, { status: 429 });
  const results = await searchListings(query || "");
  const body = formatSearchResults(results, (user.credits || 0) - 1);
  const sendRes = await sendWhatsApp(phone, body);
  const deducted = !!sendRes?.sid ? await updateCredits(phone, -1) : false;
  if (deducted) await recordSearch(phone);
  logInfo("search", { phone, results: results.length, deducted });
  return Response.json({ ok: true, sent: !!sendRes?.sid, deducted, balance: (user.credits || 0) - (deducted ? 1 : 0), results });
}
