import assert from "node:assert/strict";
import test from "node:test";

import {
  EMPTY_MARKET_SEARCH_STATE,
  parseMarketSearchState,
  serializeMarketSearchState,
} from "./market-search-state.ts";

test("round-trips commodity, location, advanced filters and sort order", () => {
  const state = {
    filters: {
      commodity: "Wheat",
      state: "Rajasthan",
      district: "Jaipur",
      market: "Kishangarh",
    },
    recordFilters: {
      fromDate: "2026-11-01",
      toDate: "2026-11-23",
      minModalPrice: "1800",
      maxModalPrice: "2600",
    },
    sortOrder: "modal-low" as const,
  };

  assert.deepEqual(parseMarketSearchState(serializeMarketSearchState(state)), state);
});

test("ignores invalid advanced bounds and unsupported sort values", () => {
  const state = parseMarketSearchState(
    "?from=2026-02-31&min=-1&max=not-a-number&sort=unexpected&mc=%20%20Rice%20%20",
  );

  assert.deepEqual(state, {
    ...EMPTY_MARKET_SEARCH_STATE,
    filters: { ...EMPTY_MARKET_SEARCH_STATE.filters, commodity: "Rice" },
  });
});

test("bounds shared text filters and ignores unknown query parameters", () => {
  const state = parseMarketSearchState(`?mc=${"A".repeat(140)}&other=secret&sort=oldest`);

  assert.equal(state.filters.commodity.length, 100);
  assert.equal(state.sortOrder, "oldest");
  assert.equal(serializeMarketSearchState(state).includes("secret"), false);
});

test("omits default values from clean share URLs", () => {
  assert.equal(serializeMarketSearchState(EMPTY_MARKET_SEARCH_STATE), "");
});
