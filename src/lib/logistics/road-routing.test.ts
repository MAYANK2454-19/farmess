import test from "node:test";
import assert from "node:assert/strict";

import { mapRoadMatrixResponse } from "./road-routing.ts";

test("maps one-to-many road matrix values to the matching listing IDs", () => {
  const result = mapRoadMatrixResponse(
    {
      distances: [[1200, 3400]],
      durations: [[180, 420]],
    },
    ["listing-a", "listing-b"],
  );

  assert.deepEqual(result, {
    "listing-a": { distanceMeters: 1200, durationSeconds: 180 },
    "listing-b": { distanceMeters: 3400, durationSeconds: 420 },
  });
});

test("ignores unreachable or invalid matrix cells", () => {
  const result = mapRoadMatrixResponse(
    {
      distances: [[1200, null, -4, 500]],
      durations: [[180, 240, 300, Number.POSITIVE_INFINITY]],
    },
    ["valid", "unreachable", "negative", "invalid-duration"],
  );

  assert.deepEqual(result, {
    valid: { distanceMeters: 1200, durationSeconds: 180 },
  });
});

test("returns no routes for malformed matrix responses", () => {
  assert.deepEqual(mapRoadMatrixResponse(null, ["listing-a"]), {});
  assert.deepEqual(mapRoadMatrixResponse({ distances: [[10]] }, ["listing-a"]), {});
  assert.deepEqual(mapRoadMatrixResponse({ distances: [10], durations: [[5]] }, ["listing-a"]), {});
});
