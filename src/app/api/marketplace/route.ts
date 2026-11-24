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
    return NextResponse.json(
      { error: "The marketplace is available to buyer accounts." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const [lotsResult, offersResult] = await Promise.all([
    supabase
      .from("buyer_marketplace_lots")
      .select(
        "id,crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by,created_at",
      )
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

  const allowedKeys = [
    "lot_id",
    "quantity",
    "unit",
    "price_paise_per_quintal",
    "valid_until",
    "terms",
  ];
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
    return NextResponse.json(
      { error: "Enter a positive whole-number price in paise per quintal." },
      { status: 400 },
    );
  }

  if (
    typeof body.valid_until !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      body.valid_until,
    ) ||
    !Number.isFinite(Date.parse(body.valid_until)) ||
    Date.parse(body.valid_until) <= Date.now()
  ) {
    return NextResponse.json(
      { error: "Choose a valid offer expiry in the future." },
      { status: 400 },
    );
  }

  let terms: string | null = null;
  if (body.terms !== undefined && body.terms !== null && body.terms !== "") {
    if (typeof body.terms !== "string" || body.terms.trim().length > 1000) {
      return NextResponse.json(
        { error: "Offer terms must be 1000 characters or fewer." },
        { status: 400 },
      );
    }
    terms = body.terms.trim() || null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_buyer_offer", {
    p_lot_id: body.lot_id,
    p_quantity: quantity,
    p_unit: body.unit,
    p_price_paise_per_quintal: price,
    p_valid_until: new Date(body.valid_until).toISOString(),
    p_terms: terms ?? undefined,
  });

  const createdOffer = Array.isArray(data) ? data[0] : null;
  if (error || !createdOffer) {
    return NextResponse.json(
      {
        error:
          error?.message === "A buyer cannot make an offer on their own lot."
            ? "You cannot make an offer on your own produce."
            : "The offer could not be sent. The lot may have changed or its available quantity may be committed.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { offer: { ...createdOffer, is_expired: false } },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
