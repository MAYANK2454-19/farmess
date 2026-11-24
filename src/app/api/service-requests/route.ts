import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseServiceRequestCancellation } from "@/features/logistics/request-cancellation";

const LISTING_SELECT =
  "id,title,service_type,service_area,destination_area,description,price_paise,rate_basis,capacity_quantity,capacity_unit,available_from,available_until,service_radius_km,crop_suitability,cold_chain_available,verification_state";

const REQUEST_SELECT =
  "id,listing_id,origin_area,destination_area,requested_date,requested_quantity,unit,status,message,created_at,updated_at";

type RequestBody = {
  listing_id: string;
  origin_area?: string | null;
  destination_area?: string | null;
  requested_date?: string | null;
  requested_quantity?: number | null;
  unit?: "kg" | "quintal" | "tonne" | null;
  message?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function optionalText(
  body: Record<string, unknown>,
  key: string,
  limit: number,
): { value: string | null; valid: boolean } {
  const value = body[key];
  if (value === undefined || value === null || value === "") return { value: null, valid: true };
  if (typeof value !== "string") return { value: null, valid: false };
  const normalized = value.trim();
  if (normalized.length > limit) return { value: null, valid: false };
  return { value: normalized || null, valid: true };
}

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to view transport and storage services." },
      { status: 401 },
    );
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "This service-request view is for farmer accounts." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const [listingsResult, requestsResult] = await Promise.all([
    supabase
      .from("service_listings")
      .select(LISTING_SELECT)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("service_requests")
      .select(REQUEST_SELECT)
      .eq("requester_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (listingsResult.error || requestsResult.error) {
    return NextResponse.json(
      { error: "Unable to load transport and storage records." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      listings: listingsResult.data ?? [],
      requests: requestsResult.data ?? [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before requesting a service." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Only a farmer account can request these services." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the service request as JSON." }, { status: 400 });
  }

  const allowedKeys = [
    "listing_id",
    "origin_area",
    "destination_area",
    "requested_date",
    "requested_quantity",
    "unit",
    "message",
  ] as const;

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !allowedKeys.includes(key as (typeof allowedKeys)[number])) ||
    typeof body.listing_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.listing_id,
    )
  ) {
    return NextResponse.json({ error: "Select a valid service listing." }, { status: 400 });
  }

  const originArea = optionalText(body, "origin_area", 160);
  const destinationArea = optionalText(body, "destination_area", 160);
  const message = optionalText(body, "message", 1000);

  if (!originArea.valid || !destinationArea.valid || !message.valid) {
    return NextResponse.json(
      { error: "Check the area and message fields; one or more values are too long or invalid." },
      { status: 400 },
    );
  }

  let requestedDate: string | null = null;
  if (
    body.requested_date !== undefined &&
    body.requested_date !== null &&
    body.requested_date !== ""
  ) {
    if (typeof body.requested_date !== "string" || !isCalendarDate(body.requested_date)) {
      return NextResponse.json({ error: "Enter a valid requested date." }, { status: 400 });
    }
    requestedDate = body.requested_date;
  }

  let requestedQuantity: number | null = null;
  if (
    body.requested_quantity !== undefined &&
    body.requested_quantity !== null &&
    body.requested_quantity !== ""
  ) {
    const numeric =
      typeof body.requested_quantity === "number"
        ? body.requested_quantity
        : typeof body.requested_quantity === "string" &&
            /^\d+(?:\.\d{1,3})?$/.test(body.requested_quantity)
          ? Number(body.requested_quantity)
          : Number.NaN;

    if (!Number.isFinite(numeric) || numeric <= 0 || numeric > Number.MAX_SAFE_INTEGER) {
      return NextResponse.json({ error: "Enter a valid positive quantity." }, { status: 400 });
    }
    requestedQuantity = numeric;
  }

  let unit: RequestBody["unit"] = null;
  if (body.unit !== undefined && body.unit !== null && body.unit !== "") {
    if (body.unit !== "kg" && body.unit !== "quintal" && body.unit !== "tonne") {
      return NextResponse.json({ error: "Select kg, quintal or tonne." }, { status: 400 });
    }
    unit = body.unit;
  }

  if ((requestedQuantity === null) !== (unit === null)) {
    return NextResponse.json(
      { error: "Select both a quantity and its unit, or leave both blank." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: listing, error: listingError } = await supabase
    .from("service_listings")
    .select(
      "id,operator_id,service_type,service_area,destination_area,available_from,available_until",
    )
    .eq("id", body.listing_id)
    .eq("status", "active")
    .maybeSingle();

  if (listingError || !listing) {
    return NextResponse.json({ error: "This service is no longer available." }, { status: 404 });
  }

  const { data: created, error } = await supabase
    .from("service_requests")
    .insert({
      listing_id: listing.id,
      provider_user_id: listing.operator_id,
      requester_id: session.userId,
      origin_area: originArea.value,
      destination_area: destinationArea.value ?? listing.destination_area,
      requested_date: requestedDate,
      requested_quantity: requestedQuantity,
      unit,
      message: message.value,
    })
    .select(REQUEST_SELECT)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "The service request could not be saved. The listing may have changed." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { request: created },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session || session.role !== "farmer") {
    return NextResponse.json(
      { error: "Sign in with a farmer account to cancel a service request." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send a valid cancellation request as JSON." },
      { status: 400 },
    );
  }

  const parsed = parseServiceRequestCancellation(body);
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_requests")
    .update({ status: "cancelled" })
    .eq("id", parsed.id)
    .eq("requester_id", session.userId)
    .in("status", ["pending", "accepted"])
    .select("id,status,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "This request is no longer cancellable or does not belong to your account." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { request: data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
