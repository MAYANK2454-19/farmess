import "server-only";

import { assessMarketSourceDateIntegrity } from "./source-integrity";
import { fetchOgdRecordsPaginated } from "./ogd-pagination";
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

  const url = new URL(OGD_API_URL);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("offset", String(filters.offset ?? 0));
  if (filters.commodity) url.searchParams.set("filters[commodity]", filters.commodity);
  if (filters.state) url.searchParams.set("filters[state]", filters.state);
  if (filters.district) url.searchParams.set("filters[district]", filters.district);
  if (filters.market) url.searchParams.set("filters[market]", filters.market);

  try {
    const rawRecords = await fetchOgdRecordsPaginated(url, safeLimit(filters.limit));
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
