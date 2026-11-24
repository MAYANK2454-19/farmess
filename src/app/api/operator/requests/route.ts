import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { parseProviderRequestCancellation } from "@/features/operators/request-cancellation";

const REQUEST_SELECT =
  "id,listing_id,origin_area,destination_area,requested_date,requested_quantity,unit,status,message,created_at";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view provider requests." }, { status: 401 });
  }
  if (session.role !== "operator") {
    return NextResponse.json(
      { error: "Only service-provider accounts can view incoming requests." },
      { status: 403 },
    );
  }

  const supabase = await createClient();
  const { data: requests, error } = await supabase
    .from("service_requests")
    .select(REQUEST_SELECT)
    .eq("provider_user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load incoming service requests." },
      { status: 500 },
    );
  }

  const listingIds = [...new Set((requests ?? []).map((request) => request.listing_id))];
  const { data: listings, error: listingError } = listingIds.length
    ? await supabase
        .from("service_listings")
        .select("id,title,service_type")
        .eq("operator_id", session.userId)
        .in("id", listingIds)
    : { data: [], error: null };

  if (listingError) {
    return NextResponse.json(
      { error: "Unable to load the related service listings." },
      { status: 500 },
    );
  }

  const listingById = new Map((listings ?? []).map((listing) => [listing.id, listing]));
  return NextResponse.json(
    {
      requests: (requests ?? []).map((request) => ({
        ...request,
        listing: listingById.get(request.listing_id) ?? null,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before responding to a request." }, { status: 401 });
  }
  if (session.role !== "operator") {
    return NextResponse.json(
      { error: "Sign in with a service-provider account to respond." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a request ID and decision." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      { error: "Choose a valid request and accept/decline decision." },
      { status: 400 },
    );
  }

  if (body.action === "cancel") {
    const parsed = parseProviderRequestCancellation(body);
    if (!parsed.valid) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("cancel_accepted_service_request", {
      p_request_id: parsed.id,
    });
    const cancelled = data?.[0];
    if (error || !cancelled) {
      return NextResponse.json(
        { error: "This request is no longer accepted or does not belong to your account." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { request: cancelled },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (
    Object.keys(body).some((key) => key !== "id" && key !== "decision") ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    (body.decision !== "accepted" && body.decision !== "declined")
  ) {
    return NextResponse.json(
      { error: "Choose a valid request and accept/decline decision." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_requests")
    .update({ status: body.decision })
    .eq("id", body.id)
    .eq("provider_user_id", session.userId)
    .eq("status", "pending")
    .select("id,status,updated_at")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "This request is no longer pending or does not belong to your account." },
      { status: 409 },
    );
  }

  return NextResponse.json({ request: data });
}

export const GET = withApiLogging("/api/operator/requests", "GET", handleGET);
export const PATCH = withApiLogging("/api/operator/requests", "PATCH", handlePATCH);
