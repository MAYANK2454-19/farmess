import { NextRequest, NextResponse } from "next/server";

import { searchOgdPrices } from "@/lib/market-data/ogd-provider";
import type { MarketSearchFilters } from "@/lib/market-data/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalFilter(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 100) : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const filters: MarketSearchFilters = {
    commodity: optionalFilter(params.get("commodity")),
    state: optionalFilter(params.get("state")),
    district: optionalFilter(params.get("district")),
    market: optionalFilter(params.get("market")),
    limit: Number(params.get("limit") ?? 100),
  };

  const result = await searchOgdPrices(filters);
  const statusCode = result.status === "unavailable" ? 503 : 200;
  return NextResponse.json(result, {
    status: statusCode,
    headers: { "Cache-Control": "private, no-store" },
  });
}
