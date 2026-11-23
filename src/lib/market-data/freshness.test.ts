import assert from "node:assert/strict";
import test from "node:test";

import { assessMarketDataFreshness } from "./freshness.ts";

const now = new Date("2026-11-22T12:00:00.000Z");

test("accepts observations inside the freshness window", () => {
  const result = assessMarketDataFreshness("2026-11-21", now);
  assert.equal(result.status, "fresh");
  assert.ok(result.ageHours !== null && result.ageHours > 24);
});

test("marks observations outside the freshness window as stale", () => {
  const result = assessMarketDataFreshness("2026-11-19", now);
  assert.equal(result.status, "stale");
  assert.match(result.message, /older than/i);
});

test("rejects future observations from being treated as current", () => {
  const result = assessMarketDataFreshness("2026-11-23", now);
  assert.equal(result.status, "future");
  assert.ok(result.ageHours !== null && result.ageHours < 0);
});

test("handles malformed observation dates", () => {
  const result = assessMarketDataFreshness("not-a-date", now);
  assert.equal(result.status, "invalid");
  assert.equal(result.ageHours, null);
});

test("rejects an invalid freshness configuration", () => {
  assert.throws(() => assessMarketDataFreshness("2026-11-22", now, -1), RangeError);
});

test("rejects impossible calendar dates rather than normalizing them", () => {
  for (const observationDate of ["2026-02-30", "2026-13-01", "2026-04-31"]) {
    const result = assessMarketDataFreshness(observationDate, now);
    assert.equal(result.status, "invalid");
    assert.equal(result.ageHours, null);
  }
});
