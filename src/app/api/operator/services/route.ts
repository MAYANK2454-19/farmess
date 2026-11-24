import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseOperatorListingUpdate } from "@/features/operators/listing-update";

const LISTING_SELECT =
  "id,title,service_type,service_area,destination_area,description,price_paise,capacity_quantity,capacity_unit,available_from,available_until,status,created_at,service_location,destination_location,service_radius_km,crop_suitability,cold_chain_available,verification_state,rate_basis";

const RATE_BASES = [
  "per_trip",
  "per_km",
  "per_kg",
  "per_quintal",
  "per_tonne",
  "per_day",
  "fixed",
  "quote_required",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalText(
  body: Record<string, unknown>,
  key: string,
  max: number,
): { value: string | null; valid: boolean } {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return { value: null as string | null, valid: true };
  }
  if (typeof value !== "string") return { value: null, valid: false };
  const normalized = value.trim();
  return { value: normalized || null, valid: normalized.length <= max };
}

function parseCoordinate(
  value: unknown,
  minimum: number,
  maximum: number,
): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return undefined;
  return parsed;
}

function parseCropSuitability(value: unknown): string[] | null {
  if (value === undefined || value === null || value === "") return [];
  if (!Array.isArray(value) || value.length > 20) return null;
  const items: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim() || item.trim().length > 80) return null;
    const crop = item.trim();
    if (
      !items.some(
        (existing) => existing.toLocaleLowerCase("en-IN") === crop.toLocaleLowerCase("en-IN"),
      )
    ) {
      items.push(crop);
    }
  }
  return items;
}

async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to manage your services." }, { status: 401 });
  }
  if (session.role !== "operator") {
    return NextResponse.json(
      { error: "Only service-provider accounts can manage listings." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_listings")
    .select(LISTING_SELECT)
    .eq("operator_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Unable to load your service listings." }, { status: 500 });
  }

  return NextResponse.json(
    { listings: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before publishing a service." }, { status: 401 });
  }
  if (session.role !== "operator") {
    return NextResponse.json(
      { error: "Only service-provider accounts can publish listings." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send service listing details as JSON." }, { status: 400 });
  }

  const allowed = [
    "title",
    "service_type",
    "service_area",
    "destination_area",
    "description",
    "price_paise",
    "rate_basis",
    "capacity_quantity",
    "capacity_unit",
    "available_from",
    "available_until",
    "service_latitude",
    "service_longitude",
    "destination_latitude",
    "destination_longitude",
    "service_radius_km",
    "crop_suitability",
    "cold_chain_available",
    "publish_location",
  ] as const;

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !allowed.includes(key as (typeof allowed)[number]))
  ) {
    return NextResponse.json(
      { error: "The listing contains unsupported fields." },
      { status: 400 },
    );
  }

  if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 100) {
    return NextResponse.json(
      { error: "Enter a service title using 1 to 100 characters." },
      { status: 400 },
    );
  }
  if (body.service_type !== "transport" && body.service_type !== "storage") {
    return NextResponse.json({ error: "Select transport or storage." }, { status: 400 });
  }
  if (
    typeof body.service_area !== "string" ||
    !body.service_area.trim() ||
    body.service_area.trim().length > 160
  ) {
    return NextResponse.json(
      { error: "Enter a service area using 1 to 160 characters." },
      { status: 400 },
    );
  }

  const destination = optionalText(body, "destination_area", 160);
  const description = optionalText(body, "description", 1000);
  if (!destination.valid || !description.valid) {
    return NextResponse.json(
      { error: "Destination or description is too long or invalid." },
      { status: 400 },
    );
  }

  const price =
    body.price_paise === undefined || body.price_paise === null || body.price_paise === ""
      ? null
      : body.price_paise;
  if (price !== null && (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0)) {
    return NextResponse.json(
      { error: "Price must be a positive whole number of paise." },
      { status: 400 },
    );
  }

  const rateBasisValue = body.rate_basis ?? (price === null ? "quote_required" : null);
  if (
    typeof rateBasisValue !== "string" ||
    !RATE_BASES.includes(rateBasisValue as (typeof RATE_BASES)[number])
  ) {
    return NextResponse.json({ error: "Choose the unit for the listed rate." }, { status: 400 });
  }
  const rateBasis = rateBasisValue as (typeof RATE_BASES)[number];
  if (price === null && rateBasis !== "quote_required") {
    return NextResponse.json({ error: "Enter a rate or choose quote required." }, { status: 400 });
  }
  if (price !== null && rateBasis === "quote_required") {
    return NextResponse.json({ error: "Choose how the entered rate is charged." }, { status: 400 });
  }

  const capacity =
    body.capacity_quantity === undefined ||
    body.capacity_quantity === null ||
    body.capacity_quantity === ""
      ? null
      : body.capacity_quantity;
  if (
    capacity !== null &&
    (typeof capacity !== "number" ||
      !Number.isFinite(capacity) ||
      capacity <= 0 ||
      capacity > Number.MAX_SAFE_INTEGER)
  ) {
    return NextResponse.json(
      { error: "Capacity must be a finite positive quantity." },
      { status: 400 },
    );
  }

  const capacityUnit =
    body.capacity_unit === undefined || body.capacity_unit === null || body.capacity_unit === ""
      ? null
      : body.capacity_unit;
  if (
    (capacity === null) !== (capacityUnit === null) ||
    (capacityUnit !== null &&
      capacityUnit !== "kg" &&
      capacityUnit !== "quintal" &&
      capacityUnit !== "tonne")
  ) {
    return NextResponse.json(
      { error: "Select both a capacity and its unit, or leave both blank." },
      { status: 400 },
    );
  }

  let availableFrom: string | null = null;
  let availableUntil: string | null = null;
  if (
    body.available_from !== undefined &&
    body.available_from !== null &&
    body.available_from !== ""
  ) {
    if (typeof body.available_from !== "string" || !validDate(body.available_from)) {
      return NextResponse.json(
        { error: "Enter a valid availability start date." },
        { status: 400 },
      );
    }
    availableFrom = body.available_from;
  }
  if (
    body.available_until !== undefined &&
    body.available_until !== null &&
    body.available_until !== ""
  ) {
    if (typeof body.available_until !== "string" || !validDate(body.available_until)) {
      return NextResponse.json({ error: "Enter a valid availability end date." }, { status: 400 });
    }
    availableUntil = body.available_until;
  }
  if (availableFrom && availableUntil && availableUntil < availableFrom) {
    return NextResponse.json(
      { error: "Availability end date must not precede its start date." },
      { status: 400 },
    );
  }

  if (body.cold_chain_available !== undefined && typeof body.cold_chain_available !== "boolean") {
    return NextResponse.json(
      { error: "Cold-chain availability must be true or false." },
      { status: 400 },
    );
  }
  const cropSuitability = parseCropSuitability(body.crop_suitability);
  if (cropSuitability === null) {
    return NextResponse.json({ error: "Enter up to 20 valid crop names." }, { status: 400 });
  }

  const serviceLatitude = parseCoordinate(body.service_latitude, -90, 90);
  const serviceLongitude = parseCoordinate(body.service_longitude, -180, 180);
  const destinationLatitude = parseCoordinate(body.destination_latitude, -90, 90);
  const destinationLongitude = parseCoordinate(body.destination_longitude, -180, 180);
  if (
    serviceLatitude === undefined ||
    serviceLongitude === undefined ||
    destinationLatitude === undefined ||
    destinationLongitude === undefined
  ) {
    return NextResponse.json(
      { error: "One or more map coordinates are invalid." },
      { status: 400 },
    );
  }

  const publishLocation = body.publish_location === true;
  if (body.publish_location !== undefined && typeof body.publish_location !== "boolean") {
    return NextResponse.json(
      { error: "Confirm whether to publish this service location." },
      { status: 400 },
    );
  }
  if (publishLocation && (serviceLatitude === null || serviceLongitude === null)) {
    return NextResponse.json(
      { error: "Enter both service latitude and longitude before publishing a map pin." },
      { status: 400 },
    );
  }
  if ((serviceLatitude === null) !== (serviceLongitude === null)) {
    return NextResponse.json(
      { error: "Enter both service coordinates or leave both blank." },
      { status: 400 },
    );
  }
  if ((destinationLatitude === null) !== (destinationLongitude === null)) {
    return NextResponse.json(
      { error: "Enter both destination coordinates or leave both blank." },
      { status: 400 },
    );
  }

  const radius =
    body.service_radius_km === undefined ||
    body.service_radius_km === null ||
    body.service_radius_km === ""
      ? null
      : Number(body.service_radius_km);
  if (radius !== null && (!Number.isFinite(radius) || radius <= 0 || radius > 500)) {
    return NextResponse.json(
      { error: "Service radius must be between 0 and 500 km." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_listings")
    .insert({
      operator_id: session.userId,
      title: body.title.trim(),
      service_type: body.service_type,
      service_area: body.service_area.trim(),
      destination_area: destination.value,
      description: description.value,
      price_paise: price,
      rate_basis: rateBasis,
      capacity_quantity: capacity,
      capacity_unit: capacityUnit,
      available_from: availableFrom,
      available_until: availableUntil,
      service_location:
        publishLocation && serviceLatitude !== null && serviceLongitude !== null
          ? `POINT(${serviceLongitude} ${serviceLatitude})`
          : null,
      destination_location:
        destinationLatitude !== null && destinationLongitude !== null
          ? `POINT(${destinationLongitude} ${destinationLatitude})`
          : null,
      service_radius_km: radius,
      crop_suitability: cropSuitability,
      cold_chain_available: body.cold_chain_available === true,
      status: "active",
      // Verification state is controlled by the platform, never by the operator form.
    })
    .select(LISTING_SELECT)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Your service listing could not be published. Check the details and try again." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { listing: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session || session.role !== "operator") {
    return NextResponse.json(
      { error: "Sign in with a service-provider account to update a listing." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send valid listing update details as JSON." },
      { status: 400 },
    );
  }

  if (!isRecord(body) || typeof body.id !== "string") {
    return NextResponse.json({ error: "Choose a valid service listing." }, { status: 400 });
  }

  const supabase = await createClient();

  // Preserve the existing pause / activate / close action as a separate, narrow update.
  if (Object.keys(body).length === 2 && "status" in body) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
      (body.status !== "active" && body.status !== "paused" && body.status !== "closed")
    ) {
      return NextResponse.json({ error: "Choose a valid listing and status." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("service_listings")
      .update({ status: body.status })
      .eq("id", body.id)
      .eq("operator_id", session.userId)
      .select("id,status")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "This listing could not be updated." }, { status: 409 });
    }
    return NextResponse.json({ listing: data });
  }

  const parsed = parseOperatorListingUpdate(body);
  if (!parsed.valid) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("service_listings")
    .update(parsed.value)
    .eq("id", body.id)
    .eq("operator_id", session.userId)
    .select("id,status,capacity_quantity,capacity_unit,available_from,available_until")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "This listing could not be updated." }, { status: 409 });
  }

  return NextResponse.json(
    { listing: data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/operator/services", "GET", handleGET);
export const POST = withApiLogging("/api/operator/services", "POST", handlePOST);
export const PATCH = withApiLogging("/api/operator/services", "PATCH", handlePATCH);
