import assert from "node:assert/strict";
import test from "node:test";

import { getMarketRecordFreshnessLabel } from "./record-freshness.ts";

const now = new Date("2026-11-22T12:00:00.000Z");

test("labels observations within the 48-hour window", () => {
  const result = getMarketRecordFreshnessLabel("2026-11-21", now);
  assert.equal(result.status, "fresh");
  assert.equal(result.label, "Within 48 hours");
});

test("clearly labels observations older than the freshness window", () => {
  const result = getMarketRecordFreshnessLabel("2026-11-19", now);
  assert.equal(result.status, "stale");
  assert.equal(result.label, "Older than 48 hours");
  assert.match(result.explanation, /older than/i);
});

test("never labels future-dated observations as fresh", () => {
  const result = getMarketRecordFreshnessLabel("2026-11-23", now);
  assert.equal(result.status, "future");
  assert.equal(result.label, "Future-dated");
});

test("provides a safe label for invalid observation dates", () => {
  const result = getMarketRecordFreshnessLabel("2026-02-30", now);
  assert.equal(result.status, "invalid");
  assert.equal(result.label, "Date unavailable");
});
