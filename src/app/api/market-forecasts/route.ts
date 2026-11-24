import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function handleGET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const crop = params.get("crop")?.trim() || null;
  const market = params.get("market")?.trim() || null;

  if (crop && crop.length > 120) {
    return NextResponse.json(
      { error: "Crop filter must be 120 characters or fewer." },
      { status: 400 },
    );
  }
  if (market && market.length > 160) {
    return NextResponse.json(
      { error: "Market filter must be 160 characters or fewer." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  let forecastQuery = supabase
    .from("market_forecast_runs")
    .select(
      "id,crop,variety,state,district,market_name,horizon_days,model_name,model_version,training_observation_count,training_start,training_end,baseline_mae_paise_per_quintal,model_mae_paise_per_quintal,baseline_smape_percent,model_smape_percent,generated_at,approved_at",
    )
    .eq("status", "approved")
    .order("generated_at", { ascending: false })
    .limit(1);

  if (crop) forecastQuery = forecastQuery.ilike("crop", crop);
  if (market) forecastQuery = forecastQuery.ilike("market_name", market);

  const { data: runs, error: runError } = await forecastQuery;
  if (runError) {
    return NextResponse.json({ error: "Approved forecasts could not be loaded." }, { status: 503 });
  }

  const run = runs?.[0];
  if (!run) {
    let observationsQuery = supabase
      .from("market_observations")
      .select("id", { count: "exact", head: true });
    if (crop) observationsQuery = observationsQuery.ilike("crop", crop);
    if (market) observationsQuery = observationsQuery.ilike("market_name", market);

    const { count, error: observationsError } = await observationsQuery;
    return NextResponse.json(
      {
        status: "insufficient_data",
        forecast: null,
        matchingObservationCount: observationsError ? null : (count ?? 0),
        message:
          "No approved price forecast is available for these filters. Farmess will not invent a future price; a model must be trained and pass a time-ordered back-test against a naive baseline first.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { data: points, error: pointError } = await supabase
    .from("market_forecast_points")
    .select(
      "target_date,predicted_modal_price_paise_per_quintal,lower_bound_paise_per_quintal,upper_bound_paise_per_quintal",
    )
    .eq("forecast_run_id", run.id)
    .order("target_date", { ascending: true });

  if (pointError) {
    return NextResponse.json({ error: "Forecast dates could not be loaded." }, { status: 503 });
  }

  return NextResponse.json(
    {
      status: "approved",
      forecast: {
        run,
        points: points ?? [],
        priceUnit: "INR/quintal",
        confidenceMeaning:
          "Lower and upper bounds are model intervals, not guaranteed market prices.",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/market-forecasts", "GET", handleGET);
