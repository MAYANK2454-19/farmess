import "server-only";

import { assessMarketSourceDateIntegrity } from "./source-integrity";
import { fetchOgdRecordsPaginated } from "./ogd-pagination";
import { canonicalState, ogdStateName, placeNamesMatch } from "@/lib/location/india";

/** Records fetched for a state when an exact district filter finds nothing. */
const DISTRICT_FALLBACK_LIMIT = 300;
import {
  RATE_LIMIT_TTL_MS,
  SUCCESS_TTL_MS,
  TtlCache,
  cacheKeyForFilters,
  isRateLimitMessage,
} from "./ogd-cache";
import {
  emptyMarketSourceQuality,
  normalizeOgdResponseWithDiagnostics,
  OGD_API_URL,
  SOURCE_NAME,
} from "./normalize";
import type { MarketDataResult, MarketSearchFilters } from "./types";

const SOURCE_URL =
  "https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi";

function safeLimit(limit: number | undefined): number {
  if (!limit || !Number.isFinite(limit)) return 100;
  return Math.min(500, Math.max(1, Math.floor(limit)));
}

const searchCache = new TtlCache<MarketDataResult>();

/**
 * Search OGD India mandi prices, reusing a recent identical search when one is
 * cached (see ogd-cache.ts). This keeps Farmess within data.gov.in rate limits;
 * cached results keep their original retrievedAt.
 */
export async function searchOgdPrices(filters: MarketSearchFilters): Promise<MarketDataResult> {
  if (!process.env.DATA_GOV_IN_API_KEY) return fetchOgdPrices(filters);

  const key = cacheKeyForFilters(filters);
  const cached = searchCache.get(key);
  if (cached) return cached;

  const result = await fetchOgdPrices(filters);
  if (result.status !== "unavailable") {
    searchCache.set(key, result, SUCCESS_TTL_MS);
  } else if (isRateLimitMessage(result.message)) {
    searchCache.set(key, result, RATE_LIMIT_TTL_MS);
  }
  return result;
}

async function fetchOgdPrices(filters: MarketSearchFilters): Promise<MarketDataResult> {
  const retrievedAt = new Date().toISOString();
  const apiKey = process.env.DATA_GOV_IN_API_KEY;

  if (!apiKey) {
    return {
      status: "unavailable",
      records: [],
      retrievedAt,
      sourceName: SOURCE_NAME,
      message: "OGD India API key is not configured. No market prices have been loaded.",
      sourceQuality: emptyMarketSourceQuality(),
    };
  }

  // OGD spells some states differently from the administrative list (e.g. Keralam).
  const stateFilter = filters.state
    ? ogdStateName(canonicalState(filters.state) ?? filters.state)
    : undefined;

  function buildUrl(includeDistrict: boolean): URL {
    const url = new URL(OGD_API_URL);
    url.searchParams.set("api-key", apiKey as string);
    url.searchParams.set("format", "json");
    url.searchParams.set("offset", String(filters.offset ?? 0));
    if (filters.commodity) url.searchParams.set("filters[commodity]", filters.commodity);
    if (stateFilter) url.searchParams.set("filters[state]", stateFilter);
    if (includeDistrict && filters.district) {
      url.searchParams.set("filters[district]", filters.district);
    }
    if (filters.market) url.searchParams.set("filters[market]", filters.market);
    return url;
  }

  try {
    const limit = safeLimit(filters.limit);
    let rawRecords = await fetchOgdRecordsPaginated(buildUrl(true), limit);

    // The district filter is an exact match on OGD's spelling. When it finds
    // nothing, retry for the state and keep districts whose names match
    // despite spelling differences (e.g. Mayurbhanj vs Mayurbhanja).
    if (rawRecords.length === 0 && filters.district && stateFilter) {
      const broad = await fetchOgdRecordsPaginated(buildUrl(false), DISTRICT_FALLBACK_LIMIT);
      rawRecords = broad
        .filter((record) => {
          const district =
            typeof record === "object" && record !== null
              ? (record as { district?: unknown }).district
              : undefined;
          return typeof district === "string" && placeNamesMatch(district, filters.district);
        })
        .slice(0, limit);
    }
    const normalized = normalizeOgdResponseWithDiagnostics({ records: rawRecords }, retrievedAt);
    const { records, quality: sourceQuality } = normalized;
    const dateIntegrity = assessMarketSourceDateIntegrity(
      records.map((record) => record.observationDate),
      retrievedAt,
    );

    if (dateIntegrity.status !== "valid") {
      const message =
        dateIntegrity.status === "future-observation"
          ? "OGD India returned future-dated observations. Records were withheld."
          : "OGD India returned invalid observation date metadata. Records were withheld.";

      return {
        status: "unavailable",
        records: [],
        retrievedAt,
        sourceName: SOURCE_NAME,
        message,
        sourceQuality,
      };
    }

    if (records.length === 0) {
      return {
        status: "no-data",
        records: [],
        retrievedAt,
        sourceName: SOURCE_NAME,
        sourceQuality,
      };
    }

    const latestDate = records.reduce(
      (latest, record) => (record.observationDate > latest ? record.observationDate : latest),
      records[0].observationDate,
    );
    const latestAge = Date.now() - new Date(`${latestDate}T00:00:00.000Z`).getTime();
    if (latestAge > 48 * 60 * 60 * 1000) {
      return {
        status: "stale",
        records,
        retrievedAt,
        sourceName: SOURCE_NAME,
        message: `Latest returned observation is dated ${latestDate}; this daily dataset is not real-time.`,
        sourceQuality,
      };
    }
    return { status: "available", records, retrievedAt, sourceName: SOURCE_NAME, sourceQuality };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown source error";
    return {
      status: "unavailable",
      records: [],
      retrievedAt,
      sourceName: SOURCE_NAME,
      message: `Could not retrieve or validate OGD India data: ${message}`,
      sourceQuality: emptyMarketSourceQuality(),
    };
  }
}

export { SOURCE_URL };
