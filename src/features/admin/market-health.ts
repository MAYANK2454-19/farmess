import { assessMarketDataFreshness } from "../../lib/market-data/freshness.ts";

export type MarketHealthInput = {
  crop: string;
  variety: string | null;
  state: string | null;
  district: string | null;
  market_name: string;
  observation_date: string;
  source_name: string;
  modal_price_paise_per_quintal: number | null;
};

export type MarketHealthStatus = "fresh" | "stale" | "future" | "invalid";

type CoverageGroup = {
  name: string;
  observations: number;
  latestObservationDate: string | null;
  latestStatus: MarketHealthStatus;
};

export type MarketDataHealth = {
  totalObservations: number;
  sampledObservations: number;
  sampleIsLimited: boolean;
  cropCount: number;
  marketCount: number;
  seriesCount: number;
  missingModalPriceCount: number;
  dateRange: { oldest: string | null; newest: string | null };
  freshness: Record<MarketHealthStatus, number>;
  marketsNeedingReview: CoverageGroup[];
  sources: CoverageGroup[];
};

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function groupKey(parts: Array<string | null | undefined>): string {
  return parts.map(normalize).join("|");
}

function statusRank(status: MarketHealthStatus): number {
  return status === "stale" ? 0 : status === "future" ? 1 : status === "invalid" ? 2 : 3;
}

/** Summarises only the supplied bounded sample; it never modifies source records. */
export function summarizeMarketDataHealth(
  records: readonly MarketHealthInput[],
  totalObservations: number,
  now = new Date(),
): MarketDataHealth {
  const freshness: MarketDataHealth["freshness"] = {
    fresh: 0,
    stale: 0,
    future: 0,
    invalid: 0,
  };
  const crops = new Set<string>();
  const markets = new Map<string, CoverageGroup>();
  const series = new Set<string>();
  const sources = new Map<string, CoverageGroup>();
  let missingModalPriceCount = 0;
  let oldest: string | null = null;
  let newest: string | null = null;

  for (const record of records) {
    const status = assessMarketDataFreshness(record.observation_date, now).status;
    freshness[status] += 1;

    const cropKey = normalize(record.crop);
    if (cropKey) crops.add(cropKey);

    const marketKey = groupKey([record.market_name, record.district, record.state]);
    if (marketKey !== "||") {
      const current = markets.get(marketKey) ?? {
        name: [record.market_name, record.district, record.state].filter(Boolean).join(", "),
        observations: 0,
        latestObservationDate: null,
        latestStatus: status,
      };
      current.observations += 1;
      if (
        status !== "invalid" &&
        (current.latestObservationDate === null ||
          record.observation_date > current.latestObservationDate)
      ) {
        current.latestObservationDate = record.observation_date;
        current.latestStatus = status;
      }
      markets.set(marketKey, current);
    }

    const seriesKey = groupKey([
      record.crop,
      record.variety,
      record.state,
      record.district,
      record.market_name,
    ]);
    if (seriesKey !== "||||") series.add(seriesKey);

    const sourceKey = normalize(record.source_name);
    if (sourceKey) {
      const current = sources.get(sourceKey) ?? {
        name: record.source_name.trim(),
        observations: 0,
        latestObservationDate: null,
        latestStatus: status,
      };
      current.observations += 1;
      if (
        status !== "invalid" &&
        (current.latestObservationDate === null ||
          record.observation_date > current.latestObservationDate)
      ) {
        current.latestObservationDate = record.observation_date;
        current.latestStatus = status;
      }
      sources.set(sourceKey, current);
    }

    if (
      record.modal_price_paise_per_quintal === null ||
      !Number.isSafeInteger(record.modal_price_paise_per_quintal) ||
      record.modal_price_paise_per_quintal < 0
    ) {
      missingModalPriceCount += 1;
    }

    if (status !== "invalid") {
      if (oldest === null || record.observation_date < oldest) oldest = record.observation_date;
      if (newest === null || record.observation_date > newest) newest = record.observation_date;
    }
  }

  const marketGroups = [...markets.values()];
  const marketsNeedingReview = marketGroups
    .filter((market) => market.latestStatus !== "fresh")
    .sort(
      (a, b) =>
        statusRank(a.latestStatus) - statusRank(b.latestStatus) ||
        (a.latestObservationDate ?? "").localeCompare(b.latestObservationDate ?? ""),
    )
    .slice(0, 12);

  const sourceGroups = [...sources.values()].sort(
    (a, b) =>
      statusRank(a.latestStatus) - statusRank(b.latestStatus) ||
      b.observations - a.observations ||
      a.name.localeCompare(b.name),
  );

  return {
    totalObservations: Math.max(0, totalObservations),
    sampledObservations: records.length,
    sampleIsLimited: totalObservations > records.length,
    cropCount: crops.size,
    marketCount: markets.size,
    seriesCount: series.size,
    missingModalPriceCount,
    dateRange: { oldest, newest },
    freshness,
    marketsNeedingReview,
    sources: sourceGroups,
  };
}
