import assert from "node:assert/strict";
import test from "node:test";

import { matchLotToRequirement, type DemandRequirement, type SellerLot } from "./seller-demand.ts";

const lot = (o: Partial<SellerLot> = {}): SellerLot => ({
  id: "lot",
  crop: "Tomato",
  variety: "Hybrid",
  grade: "A",
  quantity: 8,
  unit: "quintal",
  area: "Narwal, Jammu",
  availableFrom: "2026-11-26",
  sellBy: "2026-11-30",
  status: "published",
  ...o,
});

const req = (o: Partial<DemandRequirement> = {}): DemandRequirement => ({
  id: "req",
  crop: "tomato",
  variety: null,
  grade: null,
  minQuantity: 5,
  maxQuantity: 20,
  unit: "quintal",
  marketArea: "Jammu",
  deliveryBy: "2026-11-28",
  ...o,
});

test("a fully fitting requirement is a match", () => {
  const result = matchLotToRequirement(lot(), req());
  assert.equal(result?.status, "match");
  assert.equal(result?.score, 100);
  assert.equal(result?.quantityCoveragePercent, 100);
});

test("a different crop is not shown at all", () => {
  assert.equal(matchLotToRequirement(lot(), req({ crop: "Onion" })), null);
});

test("less quantity, another area and a later date are partial with clear gaps", () => {
  const result = matchLotToRequirement(
    lot({ quantity: 300, unit: "kg", area: "Kathua", availableFrom: "2026-11-29" }),
    req({ minQuantity: 5 }),
  );
  assert.equal(result?.status, "partial");
  assert.equal(result?.quantityCoveragePercent, 60);
  assert.ok(result?.gaps.some((gap) => gap.includes("60%")));
  assert.ok(result?.gaps.some((gap) => gap.includes("Kathua")));
  assert.ok(result?.gaps.some((gap) => gap.includes("1 day(s) after")));
  assert.ok((result?.score ?? 100) < 50);
});

test("drafts are matched but told to publish; withdrawn lots are skipped", () => {
  const draft = matchLotToRequirement(lot({ status: "draft" }), req());
  assert.equal(draft?.status, "partial");
  assert.ok(draft?.gaps.some((gap) => gap.includes("publish")));
  assert.equal(matchLotToRequirement(lot({ status: "withdrawn" }), req()), null);
});
