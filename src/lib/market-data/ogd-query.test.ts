import assert from "node:assert/strict";
import test from "node:test";

import { currentPricesUrl } from "./ogd-query.ts";

test("names Farmess knows exactly are asked for in the exact form", () => {
  const url = currentPricesUrl("k", {
    commodity: { name: "Bitter gourd", exact: true },
    state: { name: "Uttar Pradesh", exact: true },
    district: { name: "East Champaran/ Motihari", exact: true },
    offset: 20,
  });
  assert.equal(url.searchParams.get("filters[commodity.keyword]"), "Bitter gourd");
  assert.equal(url.searchParams.get("filters[state.keyword]"), "Uttar Pradesh");
  assert.equal(url.searchParams.get("filters[district.keyword]"), "East Champaran/ Motihari");
  // The word-matching form would also find Madhya Pradesh and every other gourd.
  assert.equal(url.searchParams.get("filters[state]"), null);
  assert.equal(url.searchParams.get("filters[commodity]"), null);
  assert.equal(url.searchParams.get("offset"), "20");
  assert.equal(url.searchParams.get("format"), "json");
});

test("free text keeps the word match", () => {
  const url = currentPricesUrl("k", {
    commodity: { name: "gourd", exact: false },
    district: { name: "Mayurbhanj", exact: false },
    market: "Narwal",
  });
  assert.equal(url.searchParams.get("filters[commodity]"), "gourd");
  assert.equal(url.searchParams.get("filters[district]"), "Mayurbhanj");
  assert.equal(url.searchParams.get("filters[market]"), "Narwal");
  assert.equal(url.searchParams.get("filters[commodity.keyword]"), null);
  assert.equal(url.searchParams.get("filters[state.keyword]"), null);
  assert.equal(url.searchParams.get("offset"), "0");
});

test("nothing is filtered that was not asked for", () => {
  const url = currentPricesUrl("k", { state: null, commodity: { name: "", exact: true } });
  assert.deepEqual(
    [...url.searchParams.keys()].filter((name) => name.startsWith("filters")),
    [],
  );
});
