import assert from "node:assert/strict";
import test from "node:test";

import { canonicalCommodity, COMMODITY_NAMES } from "./commodities.ts";

test("letter case and spacing do not matter", () => {
  assert.deepEqual(canonicalCommodity("tomato"), { name: "Tomato", known: true });
  assert.deepEqual(canonicalCommodity("  GREEN   chilli "), { name: "Green Chilli", known: true });
  assert.equal(canonicalCommodity("bottle gourd").name, "Bottle gourd");
  assert.equal(canonicalCommodity("watermelon").name, "Water Melon");
});

test("plurals, everyday names and Hindi names map to the source's spelling", () => {
  assert.equal(canonicalCommodity("tomatoes").name, "Tomato");
  assert.equal(canonicalCommodity("onions").name, "Onion");
  assert.equal(canonicalCommodity("cherries").name, "Cherry");
  assert.equal(canonicalCommodity("paddy").name, "Paddy(Dhan)(Common)");
  assert.equal(canonicalCommodity("bhindi").name, "Bhindi(Ladies Finger)");
  assert.equal(canonicalCommodity("okra").name, "Bhindi(Ladies Finger)");
  assert.equal(canonicalCommodity("soybean").name, "Soyabean");
  assert.equal(canonicalCommodity("aloo").name, "Potato");
  assert.equal(canonicalCommodity("cucumber").name, "Cucumbar(Kheera)");
  assert.equal(canonicalCommodity("ginger").name, "Ginger(Green)");
});

test("the part before a bracket finds the name when it is unambiguous", () => {
  assert.equal(canonicalCommodity("persimon").name, "Persimon(Japani Fal)");
  assert.equal(canonicalCommodity("Tinda").name, "Tinda");
});

test("the source's own spelling is returned unchanged", () => {
  for (const name of COMMODITY_NAMES) {
    assert.deepEqual(canonicalCommodity(name), { name, known: true }, name);
  }
});

test("unknown names are passed through cleaned, and empty input stays empty", () => {
  assert.deepEqual(canonicalCommodity("  Dragon   Fruit "), { name: "Dragon Fruit", known: false });
  assert.deepEqual(canonicalCommodity(""), { name: "", known: false });
  assert.deepEqual(canonicalCommodity(null), { name: "", known: false });
  assert.equal(canonicalCommodity("x".repeat(300)).name.length, 100);
});

test("the list is sorted and free of duplicates", () => {
  assert.equal(new Set(COMMODITY_NAMES).size, COMMODITY_NAMES.length);
  assert.ok(COMMODITY_NAMES.length > 100);
});
