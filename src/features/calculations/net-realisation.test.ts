import assert from "node:assert/strict";
import test from "node:test";

import { calculateNetRealisation, type NetRealisationInput } from "./net-realisation.ts";

function completeInput(overrides: Partial<NetRealisationInput> = {}): NetRealisationInput {
  return {
    quantity: "10",
    unit: "quintal",
    expectedPricePerUnit: "2000",
    transportCost: "500",
    handlingPackagingCost: "250",
    marketCharges: "100",
    storageCost: "200",
    expectedQualityLoss: "300",
    otherDeductions: "50",
    ...overrides,
  };
}

test("calculates gross sale value, explicit deductions and net realisation", () => {
  const result = calculateNetRealisation(completeInput());

  assert.equal(result.status, "complete");
  assert.equal(result.grossSaleValue, "20000.00");
  assert.equal(result.deductionsTotal, "1400.00");
  assert.equal(result.netRealisation, "18600.00");
  assert.equal(result.deductionBreakdown.transportCost, "500.00");
});

test("keeps the result incomplete when a material cost is unknown", () => {
  const result = calculateNetRealisation(completeInput({ storageCost: "" }));

  assert.equal(result.status, "incomplete");
  assert.equal(result.grossSaleValue, "20000.00");
  assert.equal(result.deductionsTotal, null);
  assert.equal(result.netRealisation, null);
  assert.ok(result.missingFields.includes("storageCost"));
});

test("accepts an explicitly entered zero deduction", () => {
  const result = calculateNetRealisation(
    completeInput({
      transportCost: "0",
      handlingPackagingCost: "0",
      marketCharges: "0",
      storageCost: "0",
      expectedQualityLoss: "0",
      otherDeductions: "0",
    }),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.deductionsTotal, "0.00");
  assert.equal(result.netRealisation, "20000.00");
});

test("rounds a fractional quantity calculation to the nearest paise", () => {
  const result = calculateNetRealisation(
    completeInput({
      quantity: "1.234",
      unit: "tonne",
      expectedPricePerUnit: "123.45",
      transportCost: "0",
      handlingPackagingCost: "0",
      marketCharges: "0",
      storageCost: "0",
      expectedQualityLoss: "0",
      otherDeductions: "0",
    }),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.grossSaleValue, "152.34");
  assert.equal(result.netRealisation, "152.34");
});

test("rejects invalid values and quantity precision beyond three decimals", () => {
  const negative = calculateNetRealisation(completeInput({ transportCost: "-10" }));
  const excessivePrecision = calculateNetRealisation(completeInput({ quantity: "1.2345" }));

  assert.equal(negative.status, "invalid");
  assert.ok(negative.errors.transportCost);
  assert.equal(excessivePrecision.status, "invalid");
  assert.ok(excessivePrecision.errors.quantity);
});

test("allows costs to exceed the expected sale value and reports a negative net", () => {
  const result = calculateNetRealisation(
    completeInput({
      quantity: "1",
      expectedPricePerUnit: "100",
      transportCost: "200",
      handlingPackagingCost: "0",
      marketCharges: "0",
      storageCost: "0",
      expectedQualityLoss: "0",
      otherDeductions: "0",
    }),
  );

  assert.equal(result.status, "complete");
  assert.equal(result.netRealisation, "-100.00");
});
