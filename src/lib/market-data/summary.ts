import type { MarketPriceRecord } from "./types.ts";

export type MarketPriceSummary = {
  observationCount: number;
  reportedPriceCount: number;
  marketCount: number;
  averageModalPrice: number | null;
  lowestModalPrice: number | null;
  highestModalPrice: number | null;
};

function normalizeLocationPart(value: string): string {
  return value.trim().replace(/\\s+/g, " ").toLocaleLowerCase("en-IN");
}

export function summarizeMarketPriceRecords(
  records: readonly MarketPriceRecord[],
): MarketPriceSummary {
  const marketKeys = new Set<string>();
  const prices: number[] = [];

  for (const record of records) {
    if (record.valueType !== "reported") continue;

    const location = [record.market, record.district, record.state]
      .map(normalizeLocationPart);
    if (location.some(Boolean)) marketKeys.add(location.join("|"));

    if (record.modalPrice === null || record.modalPrice.trim() === "") continue;
    const price = Number(record.modalPrice);
    if (!Number.isFinite(price) || price < 0) continue;
    prices.push(price);
  }

  if (prices.length === 0) {
    return {
      observationCount: records.length,
      reportedPriceCount: 0,
      marketCount: marketKeys.size,
      averageModalPrice: null,
      lowestModalPrice: null,
      highestModalPrice: null,
    };
  }

  const total = prices.reduce((sum, price) => sum + price, 0);

  return {
    observationCount: records.length,
    reportedPriceCount: prices.length,
    marketCount: marketKeys.size,
    averageModalPrice: total / prices.length,
    lowestModalPrice: Math.min(...prices),
    highestModalPrice: Math.max(...prices),
  };
}
