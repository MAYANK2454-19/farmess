import assert from "node:assert/strict";
import test from "node:test";

import { TtlCache, cacheKeyForFilters, isRateLimitMessage } from "./ogd-cache.ts";

test("entries expire after their time to live", () => {
  let now = 1_000;
  const cache = new TtlCache<string>(10, () => now);
  cache.set("a", "value", 500);
  assert.equal(cache.get("a"), "value");
  now = 1_499;
  assert.equal(cache.get("a"), "value");
  now = 1_500;
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.size, 0);
});

test("the cache stays bounded by evicting the oldest entry", () => {
  const cache = new TtlCache<number>(2, () => 0);
  cache.set("a", 1, 1000);
  cache.set("b", 2, 1000);
  cache.set("c", 3, 1000);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), 3);
});

test("filter order, case and blank values do not change the key", () => {
  assert.equal(
    cacheKeyForFilters({ commodity: "Tomato", state: " Jammu and Kashmir ", district: "" }),
    cacheKeyForFilters({ state: "jammu and kashmir", commodity: "tomato" }),
  );
  assert.notEqual(
    cacheKeyForFilters({ commodity: "Tomato", offset: 0 }),
    cacheKeyForFilters({ commodity: "Tomato", offset: 100 }),
  );
});

test("only provider rate-limit messages are treated as rate limits", () => {
  assert.equal(isRateLimitMessage("OGD India returned HTTP 429."), true);
  assert.equal(isRateLimitMessage("OGD India returned HTTP 500."), false);
  assert.equal(isRateLimitMessage(undefined), false);
});
