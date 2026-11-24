import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

function isOptionalBoolean(value: unknown): value is boolean | null {
  return value === null || typeof value === "boolean";
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to send recommendation feedback." },
      { status: 401 },
    );
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Only a farmer account can rate logistics recommendations." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a recommendation feedback record." }, { status: 400 });
  }

  const allowed = [
    "service_listing_id",
    "rank_position",
    "distance_meters",
    "capacity_match",
    "crop_match",
    "date_match",
    "cold_chain_match",
    "service_radius_match",
    "user_feedback",
    "feedback_note",
  ] as const;

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key as (typeof allowed)[number]))
  ) {
    return NextResponse.json(
      { error: "The feedback contains unsupported fields." },
      { status: 400 },
    );
  }

  const record = body as Record<string, unknown>;
  const listingId = record.service_listing_id;
  if (
    typeof listingId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(listingId)
  ) {
    return NextResponse.json({ error: "Select a valid service listing." }, { status: 400 });
  }
  if (
    typeof record.rank_position !== "number" ||
    !Number.isSafeInteger(record.rank_position) ||
    record.rank_position < 1 ||
    record.rank_position > 100
  ) {
    return NextResponse.json(
      { error: "Recommendation position must be from 1 to 100." },
      { status: 400 },
    );
  }
  if (
    typeof record.distance_meters !== "number" ||
    !Number.isFinite(record.distance_meters) ||
    record.distance_meters < 0 ||
    record.distance_meters > 100000
  ) {
    return NextResponse.json({ error: "Recommendation distance is invalid." }, { status: 400 });
  }

  for (const key of ["capacity_match", "crop_match", "date_match", "cold_chain_match"] as const) {
    if (!isOptionalBoolean(record[key] ?? null)) {
      return NextResponse.json(
        { error: "Recommendation match fields must be true, false or unknown." },
        { status: 400 },
      );
    }
  }

  if (
    typeof record.user_feedback !== "number" ||
    !Number.isSafeInteger(record.user_feedback) ||
    record.user_feedback < 1 ||
    record.user_feedback > 5
  ) {
    return NextResponse.json(
      { error: "Rating must be a whole number from 1 to 5." },
      { status: 400 },
    );
  }

  let feedbackNote: string | null = null;
  const note = record.feedback_note;
  if (note !== undefined && note !== null && note !== "") {
    if (typeof note !== "string" || note.trim().length > 300) {
      return NextResponse.json(
        { error: "Feedback note must be 300 characters or fewer." },
        { status: 400 },
      );
    }
    feedbackNote = note.trim() || null;
  }

  const supabase = await createClient();
  const { data: listing, error: listingError } = await supabase
    .from("service_listings")
    .select("id,service_type,verification_state,rate_basis,price_paise,service_radius_km")
    .eq("id", listingId)
    .eq("status", "active")
    .maybeSingle();

  if (listingError || !listing) {
    return NextResponse.json(
      { error: "This provider listing is no longer available." },
      { status: 404 },
    );
  }

  const { data, error } = await supabase
    .from("logistics_recommendation_feedback")
    .insert({
      user_id: session.userId,
      service_listing_id: listing.id,
      recommendation_version: "rules-v1",
      rank_position: record.rank_position,
      distance_meters: record.distance_meters,
      capacity_match: record.capacity_match as boolean | null,
      crop_match: record.crop_match as boolean | null,
      date_match: record.date_match as boolean | null,
      cold_chain_match: record.cold_chain_match as boolean | null,
      service_radius_match: record.service_radius_match as boolean | null,
      provider_verification_state: listing.verification_state,
      service_type: listing.service_type,
      rate_basis: listing.rate_basis,
      price_paise: listing.price_paise,
      service_radius_km: listing.service_radius_km,
      user_feedback: record.user_feedback,
      feedback_note: feedbackNote,
    })
    .select("id,created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Your feedback could not be saved." }, { status: 409 });
  }

  return NextResponse.json(
    { feedback: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

export const POST = withApiLogging("/api/logistics/feedback", "POST", handlePOST);
