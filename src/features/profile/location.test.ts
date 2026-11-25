import assert from "node:assert/strict";
import test from "node:test";

import { parseLocationPatch } from "./location.ts";

const NOW = new Date("2026-11-25T10:00:00.000Z");

test("a PIN-based location is accepted and coordinates are rounded to ~1 km", () => {
  const result = parseLocationPatch(
    {
      state: "Jammu and Kashmir",
      district: "Jammu",
      pincode: "180001",
      location_latitude: 32.725521,
      location_longitude: 74.862652,
      location_source: "pincode",
    },
    NOW,
  );
  assert.deepEqual(result, {
    ok: true,
    update: {
      state: "Jammu and Kashmir",
      district: "Jammu",
      pincode: "180001",
      location_latitude: 32.73,
      location_longitude: 74.86,
      location_source: "pincode",
      location_updated_at: NOW.toISOString(),
    },
  });
});

test("updates without location fields leave location unchanged", () => {
  assert.deepEqual(parseLocationPatch({ display_name: "Ravi" }, NOW), { ok: true, update: {} });
});

test("clearing the location sets every field to null", () => {
  const result = parseLocationPatch(
    { state: "", district: "", pincode: "", location_latitude: null, location_longitude: null },
    NOW,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.update.state, null);
    assert.equal(result.update.location_latitude, null);
  }
});

test("invalid states, PINs and districts without states are rejected", () => {
  for (const body of [
    { state: "Atlantis" },
    { district: "Jammu" },
    { state: "Jammu and Kashmir", pincode: "012345" },
    { state: "Jammu and Kashmir", location_source: "satellite" },
  ]) {
    assert.equal(parseLocationPatch(body, NOW).ok, false, JSON.stringify(body));
  }
});

test("coordinates must be a pair inside India", () => {
  assert.equal(parseLocationPatch({ location_latitude: 32.7 }, NOW).ok, false);
  assert.equal(
    parseLocationPatch({ location_latitude: 51.5, location_longitude: -0.12 }, NOW).ok,
    false,
  );
  assert.equal(
    parseLocationPatch({ location_latitude: "32.7", location_longitude: "74.8" }, NOW).ok,
    false,
  );
});
