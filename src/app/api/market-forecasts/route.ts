import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canonicalState, ogdStateName } from "@/lib/location/india";
import { forecastPrices, MINIMUM_REPORTS } from "@/lib/market-data/price-forecast";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 400;

type Row = {
  observation_date: string;
  modal_price_paise_per_quintal: number | null;
  market_name: string;
  district: string;
  state: string;
};

function limitedText(params: URLSearchParams, key: string, max: number) {
  const value = params.get(key)?.trim() || null;
  return value && value.length > max
    ? { error: `${key} must be ${max} characters or fewer.` }
    : { value };
}

/**
 * Price trend and short-term forecast for one crop at one mandi, computed from
 * saved AGMARKNET reports (see price-forecast.ts). When no mandi is given, the
 * mandi with the most saved reports for the crop (within the state/district
 * filters) is used and named in the response.
 */
async function handleGET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const crop = limitedText(params, "crop", 120);
  const market = limitedText(params, "market", 160);
  const state = limitedText(params, "state", 120);
  const district = limitedText(params, "district", 120);
  for (const field of [crop, market, state, district]) {
    if ("error" in field) return NextResponse.json({ error: field.error }, { status: 400 });
  }
  if (!crop.value) {
    return NextResponse.json(
      {
        status: "choose_crop",
        message: "Choose a crop to see its price trend.",
        minimumReports: MINIMUM_REPORTS,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const stateName = state.value ? ogdStateName(canonicalState(state.value) ?? state.value) : null;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const supabase = await createClient();

  const baseQuery = () => {
    let query = supabase
      .from("market_observations")
      .select("observation_date,modal_price_paise_per_quintal,market_name,district,state")
      .ilike("crop", crop.value!)
      .gte("observation_date", since)
      .not("modal_price_paise_per_quintal", "is", null)
      .order("observation_date", { ascending: false })
      .limit(1000);
    if (stateName) query = query.ilike("state", stateName);
    if (district.value) query = query.ilike("district", district.value);
    return query;
  };

  // Rank mandis by how many reports are saved, so the busiest one is used by default.
  const { data: recent, error: recentError } = await baseQuery();
  if (recentError) {
    return NextResponse.json({ error: "Saved prices could not be loaded." }, { status: 503 });
  }
  const counts = new Map<string, number>();
  for (const row of (recent ?? []) as Row[]) {
    counts.set(row.market_name, (counts.get(row.market_name) ?? 0) + 1);
  }
  const markets = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([name, reports]) => ({ name, reports }));

  const chosenMarket =
    (market.value &&
      ([...counts.keys()].find((name) => name.toLowerCase() === market.value!.toLowerCase()) ??
        market.value)) ||
    markets[0]?.name ||
    null;

  if (!chosenMarket) {
    return NextResponse.json(
      {
        status: "no_saved_prices",
        crop: crop.value,
        markets,
        minimumReports: MINIMUM_REPORTS,
        message:
          "No saved mandi prices for this crop and area yet. An admin can import past prices from data.gov.in.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { data: rows, error } = await baseQuery().ilike("market_name", chosenMarket);
  if (error) {
    return NextResponse.json({ error: "Saved prices could not be loaded." }, { status: 503 });
  }
  const seriesRows = (rows ?? []) as Row[];
  const result = forecastPrices(
    seriesRows.map((row) => ({
      date: row.observation_date,
      price: (row.modal_price_paise_per_quintal ?? 0) / 100,
    })),
  );

  return NextResponse.json(
    {
      status: result.status,
      crop: crop.value,
      market: chosenMarket,
      district: seriesRows[0]?.district ?? null,
      state: seriesRows[0]?.state ?? null,
      markets,
      priceUnit: "INR/quintal (modal price)",
      minimumReports: MINIMUM_REPORTS,
      result,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/market-forecasts", "GET", handleGET);
