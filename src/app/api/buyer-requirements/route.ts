import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const REQUIREMENT_SELECT =
  "id,crop,variety,grade,market_area,min_quantity,max_quantity,unit,target_price_paise_per_quintal,delivery_by,status,created_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to manage buyer requirements." }, { status: 401 });
  }
  if (session.role !== "buyer") {
    return NextResponse.json(
      { error: "Buyer requirements are available to buyer accounts." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyer_requirements")
    .select(REQUIREMENT_SELECT)
    .eq("buyer_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Unable to load your requirements." }, { status: 500 });
  }

  return NextResponse.json(
    { requirements: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before creating a requirement." }, { status: 401 });
  }
  if (session.role !== "buyer") {
    return NextResponse.json(
      { error: "Only buyer accounts can create requirements." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send requirement details as JSON." }, { status: 400 });
  }

  const allowed = [
    "crop",
    "variety",
    "grade",
    "market_area",
    "min_quantity",
    "max_quantity",
    "unit",
    "target_price_paise_per_quintal",
    "delivery_by",
  ] as const;

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !allowed.includes(key as (typeof allowed)[number]))
  ) {
    return NextResponse.json(
      { error: "The requirement contains unsupported fields." },
      { status: 400 },
    );
  }

  if (typeof body.crop !== "string" || !body.crop.trim() || body.crop.trim().length > 80) {
    return NextResponse.json(
      { error: "Enter a crop name using 1 to 80 characters." },
      { status: 400 },
    );
  }
  if (
    typeof body.market_area !== "string" ||
    !body.market_area.trim() ||
    body.market_area.trim().length > 120
  ) {
    return NextResponse.json(
      { error: "Enter a market or delivery area using 1 to 120 characters." },
      { status: 400 },
    );
  }

  const variety = optionalText(body, "variety", 80);
  const grade = optionalText(body, "grade", 40);
  if (!variety.valid || !grade.valid) {
    return NextResponse.json(
      { error: "Variety or grade is too long or invalid." },
      { status: 400 },
    );
  }

  const minQuantity = typeof body.min_quantity === "number" ? body.min_quantity : Number.NaN;
  const maxQuantity =
    body.max_quantity === undefined || body.max_quantity === null || body.max_quantity === ""
      ? null
      : typeof body.max_quantity === "number"
        ? body.max_quantity
        : Number.NaN;

  if (!Number.isFinite(minQuantity) || minQuantity <= 0 || minQuantity > Number.MAX_SAFE_INTEGER) {
    return NextResponse.json(
      { error: "Enter a valid positive minimum quantity." },
      { status: 400 },
    );
  }
  if (
    maxQuantity !== null &&
    (!Number.isFinite(maxQuantity) ||
      maxQuantity < minQuantity ||
      maxQuantity > Number.MAX_SAFE_INTEGER)
  ) {
    return NextResponse.json(
      { error: "Maximum quantity must be at least the minimum quantity." },
      { status: 400 },
    );
  }

  if (body.unit !== "kg" && body.unit !== "quintal" && body.unit !== "tonne") {
    return NextResponse.json({ error: "Select kg, quintal or tonne." }, { status: 400 });
  }

  const targetPrice =
    body.target_price_paise_per_quintal === undefined ||
    body.target_price_paise_per_quintal === null ||
    body.target_price_paise_per_quintal === ""
      ? null
      : body.target_price_paise_per_quintal;

  if (
    targetPrice !== null &&
    (typeof targetPrice !== "number" || !Number.isSafeInteger(targetPrice) || targetPrice <= 0)
  ) {
    return NextResponse.json(
      { error: "Enter a positive whole-number target price in paise per quintal." },
      { status: 400 },
    );
  }

  let deliveryBy: string | null = null;
  if (body.delivery_by !== undefined && body.delivery_by !== null && body.delivery_by !== "") {
    if (typeof body.delivery_by !== "string" || !validDate(body.delivery_by)) {
      return NextResponse.json({ error: "Enter a valid delivery date." }, { status: 400 });
    }
    deliveryBy = body.delivery_by;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyer_requirements")
    .insert({
      buyer_id: session.userId,
      crop: body.crop.trim(),
      variety: variety.value,
      grade: grade.value,
      market_area: body.market_area.trim(),
      min_quantity: minQuantity,
      max_quantity: maxQuantity,
      unit: body.unit,
      target_price_paise_per_quintal: targetPrice,
      delivery_by: deliveryBy,
      status: "active",
    })
    .select(REQUIREMENT_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: "Your requirement could not be saved." }, { status: 409 });
  }

  return NextResponse.json(
    { requirement: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before updating a requirement." }, { status: 401 });
  }
  if (session.role !== "buyer") {
    return NextResponse.json(
      { error: "Sign in with a buyer account to update a requirement." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a requirement ID and status." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "id" && key !== "status") ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    (body.status !== "active" && body.status !== "paused" && body.status !== "closed")
  ) {
    return NextResponse.json({ error: "Choose a valid requirement and status." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("buyer_requirements")
    .update({ status: body.status })
    .eq("id", body.id)
    .eq("buyer_id", session.userId)
    .select("id,status")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "This requirement could not be updated." }, { status: 409 });
  }

  return NextResponse.json({ requirement: data });
}

export const GET = withApiLogging("/api/buyer-requirements", "GET", handleGET);
export const POST = withApiLogging("/api/buyer-requirements", "POST", handlePOST);
export const PATCH = withApiLogging("/api/buyer-requirements", "PATCH", handlePATCH);
