import {
  EMPTY_MARKET_RECORD_FILTERS,
  filterMarketPriceRecords,
  type MarketRecordFilters,
} from "./filter-records.ts";
import type { MarketRecordSortOrder } from "./sort-records.ts";

export type MarketSearchFilters = {
  commodity: string;
  state: string;
  district: string;
  market: string;
};

export type MarketSearchState = {
  filters: MarketSearchFilters;
  recordFilters: MarketRecordFilters;
  sortOrder: MarketRecordSortOrder;
};

export const EMPTY_MARKET_SEARCH_STATE: MarketSearchState = {
  filters: { commodity: "", state: "", district: "", market: "" },
  recordFilters: EMPTY_MARKET_RECORD_FILTERS,
  sortOrder: "newest",
};

const SORT_ORDERS = new Set<MarketRecordSortOrder>([
  "newest",
  "oldest",
  "modal-high",
  "modal-low",
]);

function cleanText(value: string | null): string {
  return (value ?? "").trim().slice(0, 100);
}

/** Parse only supported, bounded filter values from a shared market URL. */
export function parseMarketSearchState(search: string): MarketSearchState {
  const params = new URLSearchParams(search);
  const recordFilters: MarketRecordFilters = {
    fromDate: params.get("from") ?? "",
    toDate: params.get("to") ?? "",
    minModalPrice: params.get("min") ?? "",
    maxModalPrice: params.get("max") ?? "",
  };

  try {
    filterMarketPriceRecords([], recordFilters);
  } catch {
    Object.assign(recordFilters, EMPTY_MARKET_RECORD_FILTERS);
  }

  const requestedSort = params.get("sort");
  return {
    filters: {
      commodity: cleanText(params.get("mc")),
      state: cleanText(params.get("ms")),
      district: cleanText(params.get("md")),
      market: cleanText(params.get("mm")),
    },
    recordFilters,
    sortOrder:
      requestedSort && SORT_ORDERS.has(requestedSort as MarketRecordSortOrder)
        ? (requestedSort as MarketRecordSortOrder)
        : "newest",
  };
}

/** Serialize applied filters only; unsubmitted form drafts are never shared. */
export function serializeMarketSearchState(state: MarketSearchState): string {
  const params = new URLSearchParams();
  const values: Array<[string, string]> = [
    ["mc", state.filters.commodity],
    ["ms", state.filters.state],
    ["md", state.filters.district],
    ["mm", state.filters.market],
    ["from", state.recordFilters.fromDate],
    ["to", state.recordFilters.toDate],
    ["min", state.recordFilters.minModalPrice],
    ["max", state.recordFilters.maxModalPrice],
    ["sort", state.sortOrder],
  ];

  for (const [key, rawValue] of values) {
    const value = rawValue.trim();
    if (value && !(key === "sort" && value === "newest")) params.set(key, value);
  }

  return params.toString();
}

