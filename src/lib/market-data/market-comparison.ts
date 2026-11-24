import type { MarketPriceRecord } from "./types.ts";

export type MarketComparisonMarket = {
  market: string;
  district: string;
  state: string;
  observationCount: number;
  averageModalPrice: number;
  lowestModalPrice: number;
  highestModalPrice: number;
};

export type MarketComparisonGroup = {
  id: string;
  commodity: string;
  variety: string | null;
  observationDate: string;
  markets: MarketComparisonMarket[];
  priceSpread: number;
  spreadPercent: number | null;
};

type MarketAccumulator = {
  market: string;
  district: string;
  state: string;
  prices: number[];
};

type GroupAccumulator = {
  id: string;
  commodity: string;
  variety: string | null;
  observationDate: string;
  markets: Map<string, MarketAccumulator>;
};

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-IN");
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validReportedPrice(record: MarketPriceRecord): number | null {
  if (record.valueType !== "reported" || record.modalPrice === null || !record.modalPrice.trim()) {
    return null;
  }
  const price = Number(record.modalPrice);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

/**
 * Compares mandis only when commodity, variety and observation date match.
 * Repeated observations for one mandi are averaged rather than treated as
 * separate competing markets.
 */
export function buildMarketPriceComparisons(
  records: readonly MarketPriceRecord[],
): MarketComparisonGroup[] {
  const groups = new Map<string, GroupAccumulator>();

  for (const record of records) {
    const price = validReportedPrice(record);
    if (price === null || !isValidDate(record.observationDate)) continue;

    const commodityKey = normalize(record.commodity);
    const varietyKey = normalize(record.variety ?? "");
    const groupId = JSON.stringify([commodityKey, varietyKey, record.observationDate]);
    let group = groups.get(groupId);

    if (!group) {
      group = {
        id: groupId,
        commodity: record.commodity.trim(),
        variety: record.variety?.trim() || null,
        observationDate: record.observationDate,
        markets: new Map(),
      };
      groups.set(groupId, group);
    }

    const marketKey = JSON.stringify([
      normalize(record.market),
      normalize(record.district),
      normalize(record.state),
    ]);
    if (marketKey === JSON.stringify(["", "", ""])) continue;

    let market = group.markets.get(marketKey);
    if (!market) {
      market = {
        market: record.market.trim(),
        district: record.district.trim(),
        state: record.state.trim(),
        prices: [],
      };
      group.markets.set(marketKey, market);
    }
    market.prices.push(price);
  }

  const comparisons: MarketComparisonGroup[] = [];

  for (const group of groups.values()) {
    const markets = [...group.markets.values()]
      .map((market) => {
        const total = market.prices.reduce((sum, price) => sum + price, 0);
        return {
          market: market.market,
          district: market.district,
          state: market.state,
          observationCount: market.prices.length,
          averageModalPrice: total / market.prices.length,
          lowestModalPrice: Math.min(...market.prices),
          highestModalPrice: Math.max(...market.prices),
        };
      })
      .sort(
        (left, right) =>
          left.averageModalPrice - right.averageModalPrice ||
          left.market.localeCompare(right.market, "en-IN"),
      );

    if (markets.length < 2) continue;

    const lowest = markets[0].averageModalPrice;
    const highest = markets[markets.length - 1].averageModalPrice;
    const priceSpread = highest - lowest;

    comparisons.push({
      id: group.id,
      commodity: group.commodity,
      variety: group.variety,
      observationDate: group.observationDate,
      markets,
      priceSpread,
      spreadPercent: lowest > 0 ? (priceSpread / lowest) * 100 : null,
    });
  }

  return comparisons.sort(
    (left, right) =>
      right.observationDate.localeCompare(left.observationDate) ||
      left.commodity.localeCompare(right.commodity, "en-IN") ||
      (left.variety ?? "").localeCompare(right.variety ?? "", "en-IN"),
  );
}
