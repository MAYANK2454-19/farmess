import assert from "node:assert/strict";
import test from "node:test";

import { DEDUCTION_FIELDS, type DeductionField } from "../calculations/net-realisation.ts";
import {
  compareNetRealisationOptions,
  type ComparisonOptionInput,
  type NetReturnComparisonInput,
} from "./net-realisation-comparison.ts";

function completeDeductions(overrides: Partial<Record<DeductionField, string>> = {}): Record<DeductionField, string> {
  const deductions = Object.fromEntries(DEDUCTION_FIELDS.map((field) => [field.key, "0"])) as Record<
    DeductionField,
    string
  >;

  return { ...deductions, ...overrides };
}

function option(overrides: Partial<ComparisonOptionInput> = {}): ComparisonOptionInput {
  return {
    id: "option-1",
    lotId: "lot-1",
    label: "Mandi A",
    source: "market_observation",
    sourceName: "OGD India / AGMARKNET",
    valueType: "reported",
    pricePerUnit: "2000.00",
    priceUnit: "quintal",
    deductions: completeDeductions(),
    feasibility: { status: "feasible" },
    observationDate: "2026-11-20",
    retrievedAt: "2026-11-22T10:00:00.000Z",
    ...overrides,
  };
}

function comparison(overrides: Partial<NetReturnComparisonInput> = {}): NetReturnComparisonInput {
  return {
    lotId: "lot-1",
    quantity: "10",
    quantityUnit: "quintal",
    options: [
      option({ id: "option-a", label: "Mandi A", pricePerUnit: "2000" }),
      option({
        id: "option-b",
        label: "Buyer B",
        source: "buyer_offer",
        sourceName: "Buyer offer",
        valueType: "quoted",
        pricePerUnit: "1950",
        validUntil: "2026-11-25T00:00:00.000Z",
        observationDate: null,
        retrievedAt: null,
        deductions: completeDeductions({ transportCost: "100" }),
      }),
    ],
    ...overrides,
  };
}

test("ranks complete feasible options by net INR per quintal", () => {
  const result = compareNetRealisationOptions(comparison());

  assert.equal(result.status, "comparable");
  assert.equal(result.rankedOptionCount, 2);
  assert.equal(result.options[0].id, "option-a");
  assert.equal(result.options[0].rank, 1);
  assert.equal(result.options[0].grossSaleValue, "20000.00");
  assert.equal(result.options[0].netRealisation, "20000.00");
  assert.equal(result.options[0].netPerQuintal, "2000.00");
  assert.equal(result.options[1].rank, 2);
  assert.equal(result.options[1].netRealisation, "19400.00");
  assert.equal(result.options[1].deductionBreakdown.transportCost, "100.00");
});

test("normalizes price units before ranking kg, quintal and tonne offers", () => {
  const input = comparison({
    quantity: "1000",
    quantityUnit: "kg",
    options: [
      option({ id: "kg-rate", priceUnit: "kg", pricePerUnit: "20" }),
      option({ id: "quintal-rate", priceUnit: "quintal", pricePerUnit: "2000" }),
      option({
        id: "tonne-rate",
        priceUnit: "tonne",
        pricePerUnit: "20000",
        source: "buyer_offer",
        sourceName: "Bulk buyer",
        valueType: "quoted",
        observationDate: null,
        retrievedAt: null,
        validUntil: "2026-11-25T00:00:00.000Z",
      }),
    ],
  });

  const result = compareNetRealisationOptions(input);

  assert.equal(result.status, "comparable");
  assert.deepEqual(
    result.options.map((item) => [item.id, item.rank, item.netPerQuintal]),
    [
      ["kg-rate", 1, "2000.00"],
      ["quintal-rate", 1, "2000.00"],
      ["tonne-rate", 1, "2000.00"],
    ],
  );
});

test("uses competition ranking for exact ties", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({ id: "a", pricePerUnit: "2000" }),
        option({ id: "b", pricePerUnit: "2000" }),
        option({ id: "c", pricePerUnit: "1900" }),
      ],
    }),
  );

  assert.deepEqual(
    result.options.map((item) => [item.id, item.rank]),
    [
      ["a", 1],
      ["b", 1],
      ["c", 3],
    ],
  );
});

test("keeps an option visible but does not rank it when a material cost is missing", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({ id: "complete-a" }),
        option({
          id: "incomplete",
          deductions: completeDeductions({ storageCost: "" }),
        }),
      ],
    }),
  );

  assert.equal(result.status, "insufficient_data");
  assert.equal(result.rankedOptionCount, 0);
  assert.equal(result.options[0].status, "eligible");
  assert.equal(result.options[1].status, "incomplete");
  assert.equal(result.options[1].grossSaleValue, "20000.00");
  assert.equal(result.options[1].netRealisation, null);
  assert.ok(result.options[1].reasons.some((reason) => reason.includes("Storage")));
});

test("does not rank infeasible or unverified options", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({ id: "feasible" }),
        option({
          id: "infeasible",
          feasibility: { status: "infeasible", reasons: ["Pickup is outside the selling window."] },
        }),
        option({
          id: "unknown",
          feasibility: { status: "unknown", reasons: ["Transport confirmation is pending."] },
        }),
      ],
    }),
  );

  assert.equal(result.status, "insufficient_data");
  assert.equal(result.options.find((item) => item.id === "infeasible")?.status, "infeasible");
  assert.equal(
    result.options.find((item) => item.id === "unknown")?.status,
    "feasibility_unknown",
  );
  assert.equal(result.options.every((item) => item.rank === null), true);
});

test("rejects options that refer to a different produce lot", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({ id: "same-lot" }),
        option({ id: "other-lot", lotId: "lot-2" }),
      ],
    }),
  );

  assert.equal(result.status, "insufficient_data");
  assert.equal(result.options.find((item) => item.id === "other-lot")?.status, "incompatible");
  assert.equal(result.options.find((item) => item.id === "other-lot")?.rank, null);
});

test("marks duplicate option IDs invalid instead of producing ambiguous ranks", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [option({ id: "duplicate" }), option({ id: "duplicate" })],
    }),
  );

  assert.equal(result.status, "no_feasible_options");
  assert.equal(result.options.every((item) => item.status === "invalid"), true);
});

test("requires source-backed provenance for mandi observations", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({ id: "missing-source-date", observationDate: null }),
        option({
          id: "valid-buyer",
          source: "buyer_offer",
          sourceName: "Buyer offer",
          valueType: "quoted",
          observationDate: null,
          retrievedAt: null,
          validUntil: "2026-11-25T00:00:00.000Z",
        }),
      ],
    }),
  );

  assert.equal(result.status, "insufficient_data");
  assert.equal(
    result.options.find((item) => item.id === "missing-source-date")?.status,
    "invalid",
  );
});

test("keeps entered scenarios explicitly labelled", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({
          id: "entered-a",
          source: "entered_scenario",
          sourceName: "Farmer entered scenario",
          valueType: "entered",
          observationDate: null,
          retrievedAt: null,
        }),
        option({
          id: "entered-b",
          source: "entered_scenario",
          sourceName: "Farmer entered estimate",
          valueType: "estimated",
          observationDate: null,
          retrievedAt: null,
          pricePerUnit: "1900",
        }),
      ],
    }),
  );

  assert.equal(result.status, "comparable");
  assert.equal(result.options.every((item) => item.valueType === "entered" || item.valueType === "estimated"), true);
});

test("handles costs greater than gross value without suppressing a negative net", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({
          id: "negative-net",
          pricePerUnit: "100",
          deductions: completeDeductions({ transportCost: "5000" }),
        }),
        option({ id: "positive-net", pricePerUnit: "2000" }),
      ],
    }),
  );

  assert.equal(result.status, "comparable");
  assert.equal(result.options.find((item) => item.id === "negative-net")?.netRealisation, "-4000.00");
  assert.equal(result.options[1].rank, 1);
});

test("returns equal comparison ranks when all options are equivalent", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [option({ id: "a" }), option({ id: "b" })],
    }),
  );

  assert.equal(result.options[0].rank, 1);
  assert.equal(result.options[1].rank, 1);
});

test("rejects a zero, missing or over-precision lot quantity", () => {
  for (const quantity of ["0", "", "1.2345"]) {
    const result = compareNetRealisationOptions(comparison({ quantity }));
    assert.equal(result.status, "invalid_lot");
  }
});

test("never treats missing quality-loss cost as zero", () => {
  const result = compareNetRealisationOptions(
    comparison({
      options: [
        option({
          id: "unknown-loss",
          deductions: completeDeductions({ expectedQualityLoss: "" }),
        }),
        option({ id: "known-loss", deductions: completeDeductions({ expectedQualityLoss: "0" }) }),
      ],
    }),
  );

  assert.equal(result.options.find((item) => item.id === "unknown-loss")?.status, "incomplete");
  assert.equal(result.options.find((item) => item.id === "known-loss")?.deductionBreakdown.expectedQualityLoss, "0.00");
});
