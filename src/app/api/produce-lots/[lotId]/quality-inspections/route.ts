import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { assessProduceQuality, type QualityCheck } from "@/features/lots/quality-inspection";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SELECT_FIELDS =
  "id,lot_id,assessor_id,inspected_at,checks,observations,status,completed_checks,total_checks,issues,created_at";
type RouteContext = { params: Promise<{ lotId: string }> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getFarmerLot(lotId: string) {
  const supabase = await createClient();
  return (
    supabase
      .from("produce_lots")
      .select("id,crop,variety,grade")
      .eq("id", lotId)
      // owner_id is hidden from signed-in users (buyer privacy); row-level security
      // already limits a farmer to their own lots, so no owner filter is needed.
      .maybeSingle()
  );
}

async function handleGET(_request: NextRequest, context: RouteContext) {
  const session = await getFarmessSession();
  if (!session)
    return NextResponse.json({ error: "Sign in to view inspections." }, { status: 401 });
  if (session.role !== "farmer")
    return NextResponse.json(
      { error: "Only farmers can view these inspections." },
      { status: 403 },
    );
  const { lotId } = await context.params;
  if (!UUID_PATTERN.test(lotId))
    return NextResponse.json({ error: "Invalid produce lot." }, { status: 400 });
  const lotResult = await getFarmerLot(lotId);
  if (lotResult.error || !lotResult.data)
    return NextResponse.json({ error: "Produce lot not found." }, { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produce_quality_inspections")
    .select(SELECT_FIELDS)
    .eq("lot_id", lotId)
    .eq("owner_id", session.userId)
    .order("inspected_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: "Unable to load inspection history." }, { status: 500 });
  return NextResponse.json(
    { inspections: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePOST(request: NextRequest, context: RouteContext) {
  if (request.headers.get("origin") !== request.nextUrl.origin)
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  const session = await getFarmessSession();
  if (!session)
    return NextResponse.json({ error: "Sign in before saving an inspection." }, { status: 401 });
  if (session.role !== "farmer")
    return NextResponse.json(
      { error: "Only farmers can record produce inspections." },
      { status: 403 },
    );
  const { lotId } = await context.params;
  if (!UUID_PATTERN.test(lotId))
    return NextResponse.json({ error: "Invalid produce lot." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send inspection details as JSON." }, { status: 400 });
  }
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "checks" && key !== "observations") ||
    !isRecord(body.checks) ||
    (body.observations !== undefined && typeof body.observations !== "string")
  ) {
    return NextResponse.json(
      { error: "Provide valid inspection checks and notes." },
      { status: 400 },
    );
  }

  const lotResult = await getFarmerLot(lotId);
  if (lotResult.error || !lotResult.data)
    return NextResponse.json({ error: "Produce lot not found." }, { status: 404 });
  const assessment = assessProduceQuality({
    lotId,
    assessorId: session.userId,
    inspectedAt: new Date().toISOString(),
    checks: body.checks as Partial<
      Record<QualityCheck, "acceptable" | "issue_found" | "not_assessed">
    >,
    observations: typeof body.observations === "string" ? body.observations : "",
  });
  if (!assessment.valid || !assessment.normalized) {
    return NextResponse.json(
      { error: "Review the inspection details.", fields: assessment.errors },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produce_quality_inspections")
    .insert({
      lot_id: lotId,
      owner_id: session.userId,
      assessor_id: session.userId,
      inspected_at: assessment.normalized.inspectedAt,
      checks: assessment.normalized.checks,
      observations: assessment.normalized.observations,
      status: assessment.status,
      completed_checks: assessment.completedChecks,
      total_checks: assessment.totalChecks,
      issues: assessment.issues,
    })
    .select(SELECT_FIELDS)
    .single();
  if (error)
    return NextResponse.json(
      { error: "Inspection could not be saved. Please try again." },
      { status: 500 },
    );
  return NextResponse.json(
    { inspection: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging(
  "/api/produce-lots/[lotId]/quality-inspections",
  "GET",
  handleGET,
);
export const POST = withApiLogging(
  "/api/produce-lots/[lotId]/quality-inspections",
  "POST",
  handlePOST,
);
