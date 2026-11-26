import assert from "node:assert/strict";
import test from "node:test";

import {
  INDIA_DISTRICTS,
  INDIA_STATES,
  approximateCoordinate,
  canonicalDistrict,
  canonicalState,
  districtsForState,
  isValidPincode,
} from "./india.ts";

test("all 36 states and union territories are listed with districts", () => {
  assert.equal(INDIA_STATES.length, 36);
  for (const state of INDIA_STATES) {
    const districts = INDIA_DISTRICTS[state];
    assert.ok(districts.length > 0, `${state} has no districts`);
    assert.equal(new Set(districts).size, districts.length, `${state} has duplicates`);
  }
  assert.equal(districtsForState("Jammu and Kashmir").length, 20);
  assert.equal(districtsForState("Uttar Pradesh").length, 75);
});

test("provider state spellings resolve to the canonical list", () => {
  assert.equal(canonicalState("Jammu & Kashmir"), "Jammu and Kashmir");
  assert.equal(canonicalState("JAMMU AND KASHMIR"), "Jammu and Kashmir");
  assert.equal(canonicalState("Orissa"), "Odisha");
  assert.equal(canonicalState("Chattisgarh"), "Chhattisgarh");
  assert.equal(canonicalState("Daman & Diu"), "Dadra and Nagar Haveli and Daman and Diu");
  assert.equal(canonicalState("Atlantis"), null);
});

test("districts match the list, and unknown real districts are kept", () => {
  assert.equal(canonicalDistrict("Jammu and Kashmir", "Jammu district"), "Jammu");
  assert.equal(canonicalDistrict("Jammu and Kashmir", "JAMMU"), "Jammu");
  assert.equal(canonicalDistrict("Rajasthan", "Neem Ka Thana"), "Neem Ka Thana");
  assert.equal(canonicalDistrict("Rajasthan", ""), null);
});

test("PIN codes are six digits that do not start with zero", () => {
  assert.equal(isValidPincode("180001"), true);
  assert.equal(isValidPincode("080001"), false);
  assert.equal(isValidPincode("18000"), false);
  assert.equal(isValidPincode("18000a"), false);
});

test("coordinates are rounded to about one kilometre", () => {
  assert.equal(approximateCoordinate(32.726612), 32.73);
  assert.equal(approximateCoordinate(74.857049), 74.86);
});

test("OGD state spellings are used for filters", async () => {
  const { ogdStateName } = await import("./india.ts");
  assert.equal(ogdStateName("Kerala"), "Keralam");
  assert.equal(ogdStateName("Jammu and Kashmir"), "Jammu and Kashmir");
});

test("place names match across small spelling differences", async () => {
  const { placeNamesMatch } = await import("./india.ts");
  assert.equal(placeNamesMatch("Mayurbhanj", "Mayurbhanja"), true);
  assert.equal(placeNamesMatch("Davanagere", "Davangere"), true);
  assert.equal(placeNamesMatch("Sri Sathya Sai", "Sri Sathya Sai district"), true);
  assert.equal(placeNamesMatch("Jammu", "JAMMU"), true);
  assert.equal(placeNamesMatch("Jammu", "Samba"), false);
  assert.equal(placeNamesMatch("Pune", "Puri"), false);
  assert.equal(placeNamesMatch("", "Jammu"), false);
});
