import test from "node:test";
import assert from "node:assert/strict";

import { parseMarketSearchFilters } from "./filters.ts";

test("uses safe defaults when filters and limit are omitted", () => {
  assert.deepEqual(parseMarketSearchFilters(new URLSearchParams()), {
    limit: 100,
  });
});

test("trims optional filters and omits empty values", () => {
  const params = new URLSearchParams({
    commodity: "  Onion  ",
    state: " Rajasthan ",
    district: "   ",
    market: "",
  });

  assert.deepEqual(parseMarketSearchFilters(params), {
    commodity: "Onion",
    state: "Rajasthan",
    limit: 100,
  });
});

test("bounds filter values to 100 characters", () => {
  const params = new URLSearchParams({ commodity: "A".repeat(150) });
  assert.equal(parseMarketSearchFilters(params).commodity, "A".repeat(100));
});

test("accepts positive integer limits", () => {
  const params = new URLSearchParams({ limit: "25" });
  assert.equal(parseMarketSearchFilters(params).limit, 25);
});

test("caps oversized limits at the provider maximum", () => {
  const params = new URLSearchParams({ limit: "900" });
  assert.equal(parseMarketSearchFilters(params).limit, 500);
});

test("uses the default for blank, malformed, fractional and non-positive limits", () => {
  for (const value of ["", "abc", "1.5", "-2", "0", "1e3"]) {
    const params = new URLSearchParams({ limit: value });
    assert.equal(parseMarketSearchFilters(params).limit, 100, value);
  }
});

test("uses the default for values outside the safe integer range", () => {
  const params = new URLSearchParams({ limit: "999999999999999999999999" });
  assert.equal(parseMarketSearchFilters(params).limit, 100);
});
