import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";

import { scheduleCurrentPriceSave } from "@/lib/market-data/auto-import-server";
import { canonicalCommodity } from "@/lib/market-data/commodities";
import { parseMarketSearchFilters } from "@/lib/market-data/filters";
import { searchOgdPrices } from "@/lib/market-data/ogd-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handleGET(request: NextRequest) {
  const filters = parseMarketSearchFilters(request.nextUrl.searchParams);
  // data.gov.in matches commodity names exactly ("tomato" finds nothing), so
  // what was typed is matched to the source's spelling first.
  if (filters.commodity) filters.commodity = canonicalCommodity(filters.commodity).name;
  const result = await searchOgdPrices(filters);
  // Keep today's reported prices for trends and forecasts (signed-in users only).
  await scheduleCurrentPriceSave(result.records, filters);
  const statusCode = result.status === "unavailable" ? 503 : 200;
  return NextResponse.json(result, {
    status: statusCode,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const GET = withApiLogging("/api/market-prices", "GET", handleGET);
