import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const LISTING_SELECT =
  "id,title,service_type,service_area,destination_area,description,price_paise,capacity_quantity,capacity_unit,available_from,available_until,status,created_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function optionalText(body: Record<string, unknown>, key: string, max: number) {
  const value = body[key];
  if (value === undefined || value === null || value === "") {
    return { value: null as string | null, valid: true };
  }
  if (typeof value !== "string") return { value: null, valid: false };
  const normalized = value.trim();
  return { value: normalized || null, valid: normalized.length <= max };
}

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to manage your services." }, { status: 401 });
  }
  if (session.role !== "operator") {
    return NextResponse.json({ error: "Only service-provider accounts can manage listings." }, { status: 403 });
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

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before publishing a service." }, { status: 401 });
  }
  if (session.role !== "operator") {
    return NextResponse.json({ error: "Only service-provider accounts can publish listings." }, { status: 403 });
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
    "capacity_quantity",
    "capacity_unit",
    "available_from",
    "available_until",
  ] as const;

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !allowed.includes(key as (typeof allowed)[number]))
  ) {
    return NextResponse.json({ error: "The listing contains unsupported fields." }, { status: 400 });
  }

  if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 100) {
    return NextResponse.json({ error: "Enter a service title using 1 to 100 characters." }, { status: 400 });
  }
  if (body.service_type !== "transport" && body.service_type !== "storage") {
    return NextResponse.json({ error: "Select transport or storage." }, { status: 400 });
  }
  if (
    typeof body.service_area !== "string" ||
    !body.service_area.trim() ||
    body.service_area.trim().length > 160
  ) {
    return NextResponse.json({ error: "Enter a service area using 1 to 160 characters." }, { status: 400 });
  }

  const destination = optionalText(body, "destination_area", 160);
  const description = optionalText(body, "description", 1000);
  if (!destination.valid || !description.valid) {
    return NextResponse.json({ error: "Destination or description is too long or invalid." }, { status: 400 });
  }

  const price =
    body.price_paise === undefined || body.price_paise === null || body.price_paise === ""
      ? null
      : body.price_paise;
  if (price !== null && (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0)) {
    return NextResponse.json({ error: "Price must be a positive whole number of paise." }, { status: 400 });
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
    return NextResponse.json({ error: "Capacity must be a finite positive quantity." }, { status: 400 });
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
    return NextResponse.json({ error: "Select both a capacity and its unit, or leave both blank." }, { status: 400 });
  }

  let availableFrom: string | null = null;
  let availableUntil: string | null = null;
  if (body.available_from !== undefined && body.available_from !== null && body.available_from !== "") {
    if (typeof body.available_from !== "string" || !validDate(body.available_from)) {
      return NextResponse.json({ error: "Enter a valid availability start date." }, { status: 400 });
    }
    availableFrom = body.available_from;
  }
  if (body.available_until !== undefined && body.available_until !== null && body.available_until !== "") {
    if (typeof body.available_until !== "string" || !validDate(body.available_until)) {
      return NextResponse.json({ error: "Enter a valid availability end date." }, { status: 400 });
    }
    availableUntil = body.available_until;
  }
  if (availableFrom && availableUntil && availableUntil < availableFrom) {
    return NextResponse.json({ error: "Availability end date must not precede its start date." }, { status: 400 });
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
      capacity_quantity: capacity,
      capacity_unit: capacityUnit,
      available_from: availableFrom,
      available_until: availableUntil,
      status: "active",
    })
    .select(LISTING_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: "Your service listing could not be published." }, { status: 409 });
  }

  return NextResponse.json(
    { listing: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session || session.role !== "operator") {
    return NextResponse.json({ error: "Sign in with a service-provider account to update a listing." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a listing ID and status." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "id" && key !== "status") ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    (body.status !== "active" && body.status !== "paused" && body.status !== "closed")
  ) {
    return NextResponse.json({ error: "Choose a valid listing and status." }, { status: 400 });
  }

  const supabase = await createClient();
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
