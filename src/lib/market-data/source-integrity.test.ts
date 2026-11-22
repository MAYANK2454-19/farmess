import assert from "node:assert/strict";
import test from "node:test";

import { assessMarketSourceDateIntegrity } from "./source-integrity.ts";

const retrievedAt = "2026-11-22T12:00:00.000Z";

test("accepts observations on or before the retrieval date", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity(["2026-11-20", "2026-11-22"], retrievedAt), {
    status: "valid",
  });
});

test("rejects an observation dated after the retrieval date", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity(["2026-11-22", "2026-11-23"], retrievedAt), {
    status: "future-observation",
    futureDates: ["2026-11-23"],
  });
});

test("deduplicates and sorts future observation dates", () => {
  assert.deepEqual(
    assessMarketSourceDateIntegrity(["2026-11-24", "2026-11-23", "2026-11-24"], retrievedAt),
    { status: "future-observation", futureDates: ["2026-11-23", "2026-11-24"] },
  );
});

test("rejects impossible calendar dates instead of normalizing them", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity(["2026-02-30"], retrievedAt), {
    status: "invalid-observation-date",
    observationDate: "2026-02-30",
  });
});

test("rejects malformed observation dates", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity(["22/11/2026"], retrievedAt), {
    status: "invalid-observation-date",
    observationDate: "22/11/2026",
  });
});

test("rejects invalid retrieval timestamps", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity(["2026-11-21"], "not-a-timestamp"), {
    status: "invalid-retrieval-time",
  });
});

test("rejects impossible retrieval calendar dates", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity(["2026-11-21"], "2026-02-30T12:00:00.000Z"), {
    status: "invalid-retrieval-time",
  });
});

test("handles an empty observation list as valid", () => {
  assert.deepEqual(assessMarketSourceDateIntegrity([], retrievedAt), { status: "valid" });
});
