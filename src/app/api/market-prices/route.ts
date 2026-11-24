import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";

import { parseMarketSearchFilters } from "@/lib/market-data/filters";
import { searchOgdPrices } from "@/lib/market-data/ogd-provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleGET(request: NextRequest) {
  const filters = parseMarketSearchFilters(request.nextUrl.searchParams);
  const result = await searchOgdPrices(filters);
  const statusCode = result.status === "unavailable" ? 503 : 200;
  return NextResponse.json(result, {
    status: statusCode,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export const GET = withApiLogging("/api/market-prices", "GET", handleGET);
