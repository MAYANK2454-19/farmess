import assert from "node:assert/strict";
import test from "node:test";

import { nextSixHourMaxPrecipitationProbability } from "./forecast.ts";

test("uses the six hourly readings starting at the current provider time", () => {
  const result = nextSixHourMaxPrecipitationProbability(
    [
      "2026-11-24T09:00",
      "2026-11-24T10:00",
      "2026-11-24T11:00",
      "2026-11-24T12:00",
      "2026-11-24T13:00",
      "2026-11-24T14:00",
      "2026-11-24T15:00",
      "2026-11-24T16:00",
    ],
    [5, 15, 25, 35, 45, 55, 65, 75],
    "2026-11-24T10:30",
  );

  assert.equal(result, 75);
});

test("returns null when no future hourly slot matches the current time", () => {
  assert.equal(
    nextSixHourMaxPrecipitationProbability(
      ["2026-11-24T08:00", "2026-11-24T09:00"],
      [20, 40],
      "2026-11-24T10:00",
    ),
    null,
  );
});

test("ignores invalid precipitation readings and returns null when none remain", () => {
  assert.equal(
    nextSixHourMaxPrecipitationProbability(
      ["2026-11-24T10:00", "2026-11-24T11:00"],
      [null, 35],
      "2026-11-24T10:00",
    ),
    35,
  );
  assert.equal(
    nextSixHourMaxPrecipitationProbability(["2026-11-24T10:00"], [101], "2026-11-24T10:00"),
    null,
  );
});
