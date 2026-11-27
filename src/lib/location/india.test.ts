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
  assert.equal(canonicalState("Keralam"), "Kerala");
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
  assert.equal(ogdStateName("Chhattisgarh"), "Chattisgarh");
  assert.equal(ogdStateName("Andaman and Nicobar Islands"), "Andaman and Nicobar");
  assert.equal(ogdStateName("Delhi"), "NCT of Delhi");
  assert.equal(ogdStateName("Puducherry"), "Pondicherry");
  assert.equal(ogdStateName("Uttarakhand"), "Uttarakhand");
  assert.equal(ogdStateName("Jammu and Kashmir"), "Jammu and Kashmir");
  // The source's spelling leads back to the state of the list.
  for (const state of INDIA_STATES) assert.equal(canonicalState(ogdStateName(state)), state);
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

test("a source name is given to the district it fits best, never to a similar neighbour", async () => {
  const { placeMatchStrength, sourceDistrictNames } = await import("./india.ts");
  // The source joins alternative names with a slash.
  assert.equal(placeMatchStrength("East Champaran/ Motihari", "East Champaran"), 3);
  assert.deepEqual(
    sourceDistrictNames("Bihar", "East Champaran", [
      "West Chambaran",
      "East Champaran/ Motihari",
      "Siwan",
    ]),
    ["East Champaran/ Motihari"],
  );
  // Two letters apart, but each is a district of its own.
  assert.equal(placeMatchStrength("Siwan", "Saran"), 1);
  assert.deepEqual(sourceDistrictNames("Bihar", "Saran", ["Siwan"]), []);
  assert.deepEqual(sourceDistrictNames("Bihar", "Nawada", ["Nalanda"]), []);
  assert.deepEqual(sourceDistrictNames("Chhattisgarh", "Bijapur", ["Bilaspur"]), []);
  assert.deepEqual(sourceDistrictNames("Tamil Nadu", "Tiruvallur", ["Tiruvarur"]), []);
  assert.deepEqual(sourceDistrictNames("Andhra Pradesh", "East Godavari", ["West Godavari"]), []);
  // A name that fits two districts equally well is left out.
  assert.deepEqual(sourceDistrictNames("Uttar Pradesh", "Kanpur Nagar", ["Kanpur"]), []);
  // Small spelling differences still match when no other district is closer.
  assert.deepEqual(sourceDistrictNames("Odisha", "Mayurbhanj", ["Mayurbhanja", "Balasore"]), [
    "Mayurbhanja",
  ]);
  assert.deepEqual(sourceDistrictNames("Karnataka", "Davanagere", ["Davangere"]), ["Davangere"]);
  // The state may be given the way the source writes it.
  assert.deepEqual(sourceDistrictNames("Keralam", "Palakkad", ["Palakad", "Kollam"]), ["Palakad"]);
});

test("districts the source names its own way use the checked names", async () => {
  const { districtForSourceName, ogdDistrictNames, sourceDistrictNames } =
    await import("./india.ts");
  assert.deepEqual(ogdDistrictNames("Bihar", "East Champaran"), ["East Champaran/ Motihari"]);
  assert.deepEqual(ogdDistrictNames("Bihar", "munger district"), ["Munghair"]);
  assert.deepEqual(ogdDistrictNames("Bihar", "Saran"), ["Chhapra", "Saran"]);
  assert.deepEqual(ogdDistrictNames("Bihar", "Patna"), []);
  // "Chhapra" has nothing in common with "Saran" as a word; "Siwan" has, and is still refused.
  assert.deepEqual(sourceDistrictNames("Bihar", "Saran", ["Siwan", "Chhapra", "Saran"]), [
    "Chhapra",
    "Saran",
  ]);
  assert.deepEqual(sourceDistrictNames("Bihar", "Lakhisarai", ["Luckeesarai", "Sheikhpura"]), [
    "Luckeesarai",
  ]);
  // The other way round, for the weather map.
  assert.equal(districtForSourceName("Bihar", "Munghair"), "Munger");
  assert.equal(districtForSourceName("Bihar", "Kaimur/Bhabhua"), "Kaimur");
  assert.equal(districtForSourceName("Bihar", "Chhapra"), "Saran");
  assert.equal(districtForSourceName("Bihar", "Siwan"), "Siwan");
  assert.equal(districtForSourceName("Bihar", "Atlantis"), null);
  assert.equal(districtForSourceName("Uttar Pradesh", "Kanpur"), null);
});
