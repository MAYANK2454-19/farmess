import "server-only";

import { assessMarketSourceDateIntegrity } from "./source-integrity";
import { canonicalCommodity } from "./commodities";
import { fetchOgdRecordsPaginated } from "./ogd-pagination";
import {
  canonicalState,
  ogdCurrentDistrictNames,
  ogdDistrictNamesChecked,
  ogdStateName,
  sourceDistrictNames,
} from "@/lib/location/india";

/** Records read when looking for a district under another spelling. */
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
  SOURCE_NAME,
} from "./normalize";
import { currentPricesUrl, type NameFilter } from "./ogd-query";
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
  const knownState = filters.state ? canonicalState(filters.state) : null;
  const stateFilter = filters.state ? ogdStateName(knownState ?? filters.state) : undefined;
  const commodity = filters.commodity ? canonicalCommodity(filters.commodity) : null;

  // A state of the list and a listed commodity are asked for exactly; anything
  // else is matched by words (see ogd-query.ts for why that matters).
  const buildUrl = (district: NameFilter | null): URL =>
    currentPricesUrl(apiKey, {
      commodity: commodity ? { name: commodity.name, exact: commodity.known } : null,
      state: stateFilter ? { name: stateFilter, exact: knownState !== null } : null,
      district,
      market: filters.market,
      offset: filters.offset,
    });

  try {
    const limit = safeLimit(filters.limit);
    // A district the source is known to list differently ("East Champaran/
    // Motihari", or both "Chhapra" and "Saran" for Saran) is asked for under
    // those names; any other under the name it was given. Names the source has
    // stopped using ("Mysore" for Mysuru) are left out: today's reports have
    // nothing under them, and every request counts against a shared limit.
    const listed =
      filters.district && stateFilter ? ogdCurrentDistrictNames(stateFilter, filters.district) : [];
    const districtNames = listed.length > 0 ? listed : filters.district ? [filters.district] : [];
    let rawRecords: unknown[] = [];
    if (districtNames.length === 0) {
      rawRecords = await fetchOgdRecordsPaginated(buildUrl(null), limit);
    }
    for (const name of districtNames) {
      if (rawRecords.length >= limit) break;
      rawRecords.push(
        ...(await fetchOgdRecordsPaginated(
          buildUrl({ name, exact: true }),
          limit - rawRecords.length,
        )),
      );
    }

    // Still nothing, and the source's names for this state's districts have not
    // been checked: look for the district under another spelling. First let the
    // source match the name word by word ("East Champaran" finds "East
    // Champaran/ Motihari"), then read the state's rows ("Farukhabad" for
    // Farrukhabad shares no whole word). Either way only rows of a district
    // name that means this district are kept, never a similar neighbour's.
    if (
      rawRecords.length === 0 &&
      filters.district &&
      stateFilter &&
      !ogdDistrictNamesChecked(stateFilter)
    ) {
      const districtOf = (record: unknown): string | null => {
        const value =
          typeof record === "object" && record !== null
            ? (record as { district?: unknown }).district
            : undefined;
        return typeof value === "string" ? value : null;
      };
      for (const attempt of [{ name: filters.district, exact: false }, null]) {
        const found = await fetchOgdRecordsPaginated(buildUrl(attempt), DISTRICT_FALLBACK_LIMIT);
        const names = new Set(
          sourceDistrictNames(
            stateFilter,
            filters.district,
            found.map(districtOf).filter((name): name is string => name !== null),
          ),
        );
        rawRecords = found
          .filter((record) => {
            const name = districtOf(record);
            return name !== null && names.has(name);
          })
          .slice(0, limit);
        if (rawRecords.length > 0) break;
      }
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
