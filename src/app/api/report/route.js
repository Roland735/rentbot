import { createModerationTicket } from "@/lib/store";

export async function POST(req) {
  const { phone, listingId, reason } = await req.json();
  const ticket = await createModerationTicket(phone, listingId, reason);
  return Response.json({ ok: true, ticket });
}

