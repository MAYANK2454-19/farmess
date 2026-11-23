import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const OFFER_SELECT =
  "id,lot_id,quantity,unit,price_paise_per_quintal,valid_until,status,terms,created_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to browse produce lots." }, { status: 401 });
  }
  if (session.role !== "buyer") {
    return NextResponse.json({ error: "The marketplace is available to buyer accounts." }, { status: 403 });
  }

  const supabase = await createClient();
  const [lotsResult, offersResult] = await Promise.all([
    supabase
      .from("produce_lots")
      .select("id,crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("offers")
      .select(OFFER_SELECT)
      .eq("buyer_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (lotsResult.error || offersResult.error) {
    return NextResponse.json({ error: "Unable to load the marketplace." }, { status: 500 });
  }

  return NextResponse.json(
    {
      lots: lotsResult.data ?? [],
      offers: (offersResult.data ?? []).map((offer) => ({
        ...offer,
        is_expired: new Date(offer.valid_until).getTime() <= Date.now(),
      })),
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
    return NextResponse.json({ error: "Sign in before making an offer." }, { status: 401 });
  }
  if (session.role !== "buyer") {
    return NextResponse.json({ error: "Only buyer accounts can make offers." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send offer details as JSON." }, { status: 400 });
  }

  const allowedKeys = ["lot_id", "quantity", "unit", "price_paise_per_quintal", "valid_until", "terms"];
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !allowedKeys.includes(key)) ||
    !isUuid(body.lot_id)
  ) {
    return NextResponse.json({ error: "Select a valid published produce lot." }, { status: 400 });
  }

  const quantity = body.quantity;
  if (
    typeof quantity !== "number" ||
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > Number.MAX_SAFE_INTEGER
  ) {
    return NextResponse.json({ error: "Enter a valid positive offer quantity." }, { status: 400 });
  }

  if (body.unit !== "kg" && body.unit !== "quintal" && body.unit !== "tonne") {
    return NextResponse.json({ error: "Select kg, quintal or tonne." }, { status: 400 });
  }

  const price = body.price_paise_per_quintal;
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price <= 0) {
    return NextResponse.json({ error: "Enter a positive whole-number price in paise per quintal." }, { status: 400 });
  }

  if (
    typeof body.valid_until !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.valid_until) ||
    !Number.isFinite(Date.parse(body.valid_until)) ||
    Date.parse(body.valid_until) <= Date.now()
  ) {
    return NextResponse.json({ error: "Choose a valid offer expiry in the future." }, { status: 400 });
  }

  let terms: string | null = null;
  if (body.terms !== undefined && body.terms !== null && body.terms !== "") {
    if (typeof body.terms !== "string" || body.terms.trim().length > 1000) {
      return NextResponse.json({ error: "Offer terms must be 1000 characters or fewer." }, { status: 400 });
    }
    terms = body.terms.trim() || null;
  }

  const supabase = await createClient();
  const { data: lot, error: lotError } = await supabase
    .from("produce_lots")
    .select("id,owner_id,quantity,unit,status")
    .eq("id", body.lot_id)
    .eq("status", "published")
    .maybeSingle();

  if (lotError || !lot) {
    return NextResponse.json({ error: "This produce lot is no longer available." }, { status: 404 });
  }

  if (lot.owner_id === session.userId || lot.unit !== body.unit || quantity > lot.quantity) {
    return NextResponse.json(
      { error: "Offer quantity, unit or lot ownership does not match this listing." },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("offers")
    .insert({
      buyer_id: session.userId,
      farmer_id: lot.owner_id,
      lot_id: lot.id,
      quantity,
      unit: body.unit,
      price_paise_per_quintal: price,
      valid_until: new Date(body.valid_until).toISOString(),
      terms,
      status: "pending",
    })
    .select(OFFER_SELECT)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "The offer could not be sent. The lot may have changed or its available quantity may be committed." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { offer: { ...data, is_expired: false } },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
