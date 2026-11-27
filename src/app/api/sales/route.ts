import { NextResponse, type NextRequest } from "next/server";
import { toRatingSummary } from "@/features/ratings/rating";
import { getFarmessSession } from "@/lib/auth/session";
import { withApiLogging } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS = ["dispatch", "confirm_delivery", "confirm_payment"] as const;
type SaleAction = (typeof ACTIONS)[number];

const KNOWN_REFUSALS = [
  "This sale is not available to your account.",
  "This step is not available for the current status of the sale.",
];

/**
 * The signed-in person's sales (as the farmer or as the buyer), with the other
 * side's contact details and reputation. A sale exists only after an offer was
 * accepted, which is when contact details are shared.
 */
async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your sales." }, { status: 401 });
  }
  if (session.role !== "farmer" && session.role !== "buyer") {
    return NextResponse.json(
      { error: "Sales are available to farmer and buyer accounts." },
      { status: 403 },
    );
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_sales");
  if (error) {
    return NextResponse.json({ error: "Your sales could not be loaded." }, { status: 500 });
  }
  return NextResponse.json(
    {
      sales: (data ?? []).map((sale) => ({
        id: sale.id,
        my_role: sale.my_role,
        crop: sale.crop,
        variety: sale.variety,
        agreed_quantity: sale.agreed_quantity,
        unit: sale.unit,
        agreed_price_paise_per_quintal: sale.agreed_price_paise_per_quintal,
        status: sale.status,
        agreed_at: sale.agreed_at,
        updated_at: sale.updated_at,
        contact: {
          name: sale.counterparty_name,
          organisation: sale.counterparty_organisation,
          phone: sale.counterparty_phone,
          email: sale.counterparty_email,
          sharedBecause: "accepted",
        },
        counterparty_rating: toRatingSummary(
          sale.counterparty_rating_average,
          sale.counterparty_rating_count,
        ),
        my_stars: sale.my_stars,
        their_stars: sale.their_stars,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Move a sale forward: dispatched (farmer), delivered (buyer), paid (farmer). */
async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to update a sale." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a sale and a step." }, { status: 400 });
  }
  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => key !== "id" && key !== "action")
  ) {
    return NextResponse.json({ error: "Send a sale and a step." }, { status: 400 });
  }
  const { id, action } = body as { id?: unknown; action?: unknown };
  if (typeof id !== "string" || !UUID.test(id) || !ACTIONS.includes(action as SaleAction)) {
    return NextResponse.json({ error: "Choose a valid sale and step." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("advance_sale", {
    p_sale_id: id,
    p_action: action as SaleAction,
  });
  if (error || !data?.[0]) {
    const refusal = KNOWN_REFUSALS.find((message) => error?.message === message);
    return NextResponse.json(
      { error: refusal ?? "The sale could not be updated. Please try again." },
      { status: refusal ? 409 : 500 },
    );
  }
  return NextResponse.json(
    { sale: { id: data[0].id, status: data[0].status, updated_at: data[0].updated_at } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/sales", "GET", handleGET);
export const PATCH = withApiLogging("/api/sales", "PATCH", handlePATCH);
