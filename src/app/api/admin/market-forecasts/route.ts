import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ForecastPointInput = {
  target_date: string;
  predicted_modal_price_paise_per_quintal: number;
  lower_bound_paise_per_quintal: number;
  upper_bound_paise_per_quintal: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFinitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parsePoints(value: unknown): ForecastPointInput[] | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > 30) return null;

  const points: ForecastPointInput[] = [];
  let previousDate = "";

  for (const item of value) {
    if (!isRecord(item)) return null;

    const targetDate = item.target_date;
    const predicted = item.predicted_modal_price_paise_per_quintal;
    const lower = item.lower_bound_paise_per_quintal;
    const upper = item.upper_bound_paise_per_quintal;

    if (
      !isCalendarDate(targetDate) ||
      !isFinitePositive(predicted) ||
      !isFinitePositive(lower) ||
      !isFinitePositive(upper) ||
      lower > predicted ||
      predicted > upper ||
      targetDate <= previousDate
    ) {
      return null;
    }

    points.push({
      target_date: targetDate,
      predicted_modal_price_paise_per_quintal: predicted,
      lower_bound_paise_per_quintal: lower,
      upper_bound_paise_per_quintal: upper,
    });
    previousDate = targetDate;
  }

  return points;
}

async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with a data-steward account." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only an authorised Farmess data steward can stage forecasts." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send the candidate manifest and forecast points." },
      { status: 400 },
    );
  }

  const allowed = [
    "crop",
    "variety",
    "state",
    "district",
    "market_name",
    "horizon_days",
    "model_name",
    "model_version",
    "training_observation_count",
    "validated_observation_count",
    "training_start",
    "training_end",
    "baseline_mae_paise_per_quintal",
    "model_mae_paise_per_quintal",
    "baseline_smape_percent",
    "model_smape_percent",
    "points",
  ] as const;

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !allowed.includes(key as (typeof allowed)[number]))
  ) {
    return NextResponse.json(
      { error: "The candidate manifest contains unsupported fields." },
      { status: 400 },
    );
  }

  if (
    !isText(body.crop, 120) ||
    !isText(body.market_name, 160) ||
    !isText(body.model_name, 100) ||
    !isText(body.model_version, 80) ||
    (body.variety !== null && body.variety !== undefined && !isText(body.variety, 120)) ||
    (body.state !== null && body.state !== undefined && !isText(body.state, 120)) ||
    (body.district !== null && body.district !== undefined && !isText(body.district, 120))
  ) {
    return NextResponse.json(
      { error: "Crop, market or model identity is missing or too long." },
      { status: 400 },
    );
  }

  if (
    typeof body.horizon_days !== "number" ||
    !Number.isSafeInteger(body.horizon_days) ||
    body.horizon_days < 1 ||
    body.horizon_days > 30 ||
    typeof body.training_observation_count !== "number" ||
    !Number.isSafeInteger(body.training_observation_count) ||
    body.training_observation_count < 90 ||
    typeof body.validated_observation_count !== "number" ||
    !Number.isSafeInteger(body.validated_observation_count) ||
    body.validated_observation_count < 120 ||
    body.training_observation_count > body.validated_observation_count
  ) {
    return NextResponse.json(
      {
        error:
          "At least 120 unique validated observations and 90 actual training rows are required.",
      },
      { status: 400 },
    );
  }

  if (
    !isCalendarDate(body.training_start) ||
    !isCalendarDate(body.training_end) ||
    body.training_start > body.training_end
  ) {
    return NextResponse.json({ error: "The training date range is invalid." }, { status: 400 });
  }

  const baselineMae = body.baseline_mae_paise_per_quintal;
  const modelMae = body.model_mae_paise_per_quintal;
  const baselineSmape = body.baseline_smape_percent;
  const modelSmape = body.model_smape_percent;

  if (
    !isFinitePositive(baselineMae) ||
    !isFiniteNonNegative(modelMae) ||
    modelMae >= baselineMae ||
    !isFinitePositive(baselineSmape) ||
    !isFiniteNonNegative(modelSmape) ||
    modelSmape >= baselineSmape
  ) {
    return NextResponse.json(
      { error: "The candidate must improve on the persistence baseline for both MAE and sMAPE." },
      { status: 422 },
    );
  }

  const points = parsePoints(body.points);
  if (!points || points.length !== body.horizon_days) {
    return NextResponse.json(
      { error: "Forecast points must be valid, sequential dates matching the declared horizon." },
      { status: 400 },
    );
  }

  const trainingEnd = body.training_end;
  if (points.some((point) => point.target_date <= trainingEnd)) {
    return NextResponse.json(
      { error: "Forecast dates must occur after the training period." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: run, error: runError } = await supabase
    .from("market_forecast_runs")
    .insert({
      crop: body.crop.trim(),
      variety: typeof body.variety === "string" ? body.variety.trim() || null : null,
      state: typeof body.state === "string" ? body.state.trim() || null : null,
      district: typeof body.district === "string" ? body.district.trim() || null : null,
      market_name: body.market_name.trim(),
      horizon_days: body.horizon_days,
      model_name: body.model_name.trim(),
      model_version: body.model_version.trim(),
      training_observation_count: body.training_observation_count,
      validated_observation_count: body.validated_observation_count,
      training_start: body.training_start,
      training_end: body.training_end,
      baseline_mae_paise_per_quintal: baselineMae,
      model_mae_paise_per_quintal: modelMae,
      baseline_smape_percent: baselineSmape,
      model_smape_percent: modelSmape,
      status: "candidate",
      created_by_user_id: session.userId,
    })
    .select("id,status,created_at,validated_observation_count,training_observation_count")
    .single();

  if (runError || !run) {
    return NextResponse.json(
      { error: "The candidate forecast could not be staged." },
      { status: 409 },
    );
  }

  const { error: pointError } = await supabase
    .from("market_forecast_points")
    .insert(points.map((point) => ({ ...point, forecast_run_id: run.id })));

  if (pointError) {
    // Candidate rows are hidden from users. Clean up a partial staging result.
    await supabase.from("market_forecast_runs").delete().eq("id", run.id).eq("status", "candidate");
    return NextResponse.json(
      { error: "Forecast points could not be staged; the candidate was not published." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      candidate: run,
      message:
        "Candidate staged privately. A separate human approval decision is required before users can see it.",
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with a data-steward account." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only an authorised Farmess data steward can review forecasts." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Send a candidate ID, decision and review note." },
      { status: 400 },
    );
  }

  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => key !== "id" && key !== "decision" && key !== "review_notes") ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    (body.decision !== "approved" &&
      body.decision !== "rejected" &&
      body.decision !== "disabled") ||
    !isText(body.review_notes, 1000) ||
    body.review_notes.trim().length < 20
  ) {
    return NextResponse.json(
      { error: "Choose a valid candidate, decision and review note of at least 20 characters." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("market_forecast_runs")
    .update({
      status: body.decision,
      reviewed_by_user_id: session.userId,
      review_notes: body.review_notes.trim(),
      approved_at: body.decision === "approved" ? new Date().toISOString() : null,
    })
    .eq("id", body.id)
    .eq("status", "candidate")
    .select("id,status,approved_at,reviewed_by_user_id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      {
        error:
          "The candidate could not be reviewed. Check its evaluation, review history and current status.",
      },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      forecastRun: data,
      message:
        body.decision === "approved"
          ? "Forecast approved for read-only publication."
          : "Forecast review decision recorded.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const POST = withApiLogging("/api/admin/market-forecasts", "POST", handlePOST);
export const PATCH = withApiLogging("/api/admin/market-forecasts", "PATCH", handlePATCH);
