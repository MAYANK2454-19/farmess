import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseLotDraftRequest } from "@/features/lots/lot-request";

const LOT_SELECT =
  "id,crop,variety,grade,quantity,unit,approximate_area,available_from,sell_by,status,created_at,published_at";

async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your produce lots." }, { status: 401 });
  }

  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "This account cannot manage farmer produce lots." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produce_lots")
    .select(LOT_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Unable to load your produce lots." }, { status: 500 });
  }

  return NextResponse.json(
    { lots: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePOST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before saving a produce lot." }, { status: 401 });
  }

  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "This account cannot create farmer produce lots." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the produce details as JSON." }, { status: 400 });
  }

  const parsed = parseLotDraftRequest(body);
  if (parsed.status === "invalid") {
    return NextResponse.json(
      { error: "Review the produce details and correct the marked fields.", fields: parsed.errors },
      { status: 400 },
    );
  }

  const quantity = Number(parsed.data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Enter a valid positive quantity." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produce_lots")
    .insert({
      owner_id: session.userId,
      crop: parsed.data.crop,
      variety: parsed.data.variety || null,
      grade: parsed.data.grade || null,
      quantity,
      unit: parsed.data.unit,
      approximate_area: parsed.data.location,
      available_from: parsed.data.availableAt,
      sell_by: parsed.data.sellBy,
      notes: parsed.data.notes || null,
    })
    .select(LOT_SELECT)
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Your lot could not be saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { lot: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before changing a produce lot." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Only the farmer who owns a lot can publish or withdraw it." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a lot ID and action." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    !("action" in body) ||
    (body.action !== "publish" && body.action !== "withdraw") ||
    Object.keys(body).some((key) => key !== "id" && key !== "action")
  ) {
    return NextResponse.json(
      { error: "Choose a valid lot and publish/withdraw action." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const nextStatus = body.action === "publish" ? "published" : "withdrawn";
  const expectedStatus = body.action === "publish" ? "draft" : "published";

  const { data, error } = await supabase
    .from("produce_lots")
    .update({ status: nextStatus })
    .eq("id", body.id)
    .eq("status", expectedStatus)
    .select("id,crop,status,published_at,buyer_market_area")
    .maybeSingle();

  if (error || !data) {
    const message = error?.message ?? "";
    return NextResponse.json(
      {
        error:
          message.includes("approximate") || message.includes("publish")
            ? message
            : "This lot could not be updated. It may no longer be in the expected state.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      lot: {
        id: data.id,
        crop: data.crop,
        status: data.status,
        published_at: data.published_at,
        approximate_location_shared: Boolean(data.buyer_market_area),
      },
      message:
        nextStatus === "published"
          ? "Your lot is published. Buyers can see its crop and availability; approximate locality is shown only if you enabled location sharing."
          : "Your listing has been withdrawn from the buyer marketplace.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/produce-lots", "GET", handleGET);
export const POST = withApiLogging("/api/produce-lots", "POST", handlePOST);
export const PATCH = withApiLogging("/api/produce-lots", "PATCH", handlePATCH);
