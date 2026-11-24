import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view buyer offers." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Only farmer accounts can view received offers here." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data: offers, error } = await supabase
    .from("offers")
    .select("id,lot_id,quantity,unit,price_paise_per_quintal,valid_until,status,terms,created_at")
    .eq("farmer_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Unable to load buyer offers." }, { status: 500 });
  }

  const lotIds = [...new Set((offers ?? []).map((offer) => offer.lot_id))];
  const { data: lots, error: lotError } = lotIds.length
    ? await supabase.from("produce_lots").select("id,crop,variety").in("id", lotIds)
    : { data: [], error: null };

  if (lotError) {
    return NextResponse.json(
      { error: "Unable to load the produce details for these offers." },
      { status: 500 },
    );
  }

  const lotById = new Map((lots ?? []).map((lot) => [lot.id, lot]));
  const now = Date.now();
  const result = (offers ?? []).map((offer) => ({
    ...offer,
    is_expired: new Date(offer.valid_until).getTime() <= now,
    lot: lotById.get(offer.lot_id) ?? null,
  }));

  return NextResponse.json(
    { offers: result },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before responding to an offer." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Only the farmer who owns the lot can respond to this offer." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send an offer ID and a decision." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    body.id.length > 64 ||
    !("decision" in body) ||
    (body.decision !== "accepted" && body.decision !== "declined") ||
    Object.keys(body).some((key) => key !== "id" && key !== "decision")
  ) {
    return NextResponse.json(
      { error: "Only an offer ID and accept/decline decision are allowed." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({ status: body.decision })
    .eq("id", body.id)
    .eq("farmer_id", session.userId)
    .eq("status", "pending")
    .select("id,status,updated_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: "The offer could not be updated. It may have expired or changed." },
      { status: 409 },
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: "This offer is no longer pending or does not belong to your account." },
      { status: 409 },
    );
  }

  return NextResponse.json({ offer: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiLogging("/api/offers", "GET", handleGET);
export const PATCH = withApiLogging("/api/offers", "PATCH", handlePATCH);
