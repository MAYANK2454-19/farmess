import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("the list of source names points only at real districts, each name at one", async () => {
  const { OGD_DISTRICT_NAMES, OGD_DISTRICT_NAMES_CHECKED, OGD_STATEWIDE_DISTRICT_NAMES } =
    await import("./ogd-district-names.ts");
  // The one exception: a name the hand-checked file gives to several districts on
  // purpose, because the source keeps their mandis together ("Mumbai").
  const byHand: Record<string, Record<string, string | string[] | null>> = JSON.parse(
    readFileSync(
      new URL("../../../scripts/data/ogd-district-manual.json", import.meta.url),
      "utf8",
    ),
  );
  const sharedOnPurpose = (state: string, name: string, district: string) => {
    const target = byHand[state]?.[name.trim()];
    return Array.isArray(target) && target.includes(district);
  };
  for (const state of OGD_DISTRICT_NAMES_CHECKED) {
    assert.ok(INDIA_STATES.includes(state), `${state} is not a state of the list`);
  }
  for (const [state, names] of Object.entries(OGD_STATEWIDE_DISTRICT_NAMES)) {
    assert.ok(OGD_DISTRICT_NAMES_CHECKED.includes(state), `${state} was not read to the end`);
    assert.ok(names.length > 0 && names.every((name) => name.trim().length > 0));
  }
  for (const [state, districts] of Object.entries(OGD_DISTRICT_NAMES)) {
    assert.ok(OGD_DISTRICT_NAMES_CHECKED.includes(state), `${state} was not read to the end`);
    const taken = new Map<string, string>();
    for (const [district, names] of Object.entries(districts)) {
      assert.ok(districtsForState(state).includes(district), `${state}: ${district} is not listed`);
      assert.ok(names.length > 0, `${state}: ${district} has no names`);
      for (const name of names) {
        assert.ok(name.trim().length > 0, `${state}: ${district} has an empty name`);
        // Two writings of one name ("Kapurthala", "kapurthala") may share a district.
        const other = taken.get(name.trim().toLowerCase());
        if (other !== undefined && other !== district) {
          assert.ok(
            sharedOnPurpose(state, name, other) && sharedOnPurpose(state, name, district),
            `${state}: "${name}" is given to ${other} and ${district}`,
          );
        }
        taken.set(name.trim().toLowerCase(), district);
      }
    }
  }
});

test("renamed districts and padded names are asked for exactly as the source writes them", async () => {
  const { districtForSourceName, ogdDistrictNames, ogdDistrictNamesChecked, sourceDistrictNames } =
    await import("./india.ts");
  // Renamed at the source during the year: both names hold part of it.
  assert.deepEqual(ogdDistrictNames("Andhra Pradesh", "Anantapur"), ["Ananthapuramu", "Anantapur"]);
  assert.deepEqual(ogdDistrictNames("Andhra Pradesh", "YSR Kadapa"), ["YSR Kadapa", "Cuddapah"]);
  assert.deepEqual(
    sourceDistrictNames("Andhra Pradesh", "YSR Kadapa", ["Cuddapah", "Kurnool", "YSR Kadapa"]),
    ["Cuddapah", "YSR Kadapa"],
  );
  assert.equal(districtForSourceName("Andhra Pradesh", "Vijayanagaram"), "Vizianagaram");
  assert.equal(
    districtForSourceName("Andhra Pradesh", "SPSR Nellore"),
    "Sri Potti Sriramulu Nellore",
  );
  // The trailing space is part of the name at the source; without it nothing is found.
  assert.deepEqual(ogdDistrictNames("Andaman and Nicobar Islands", "North and Middle Andaman"), [
    "North and Middle Andaman ",
  ]);
  assert.equal(ogdDistrictNamesChecked("Bihar"), true);
  assert.equal(ogdDistrictNamesChecked("Atlantis"), false);
});

test("one source name can stand for every district of a state", async () => {
  const { districtForSourceName, ogdDistrictNames, sourceDistrictNames } =
    await import("./india.ts");
  // The source lists all of Delhi's mandis under the single district "Delhi".
  assert.deepEqual(ogdDistrictNames("Delhi", "New Delhi"), ["Delhi"]);
  assert.deepEqual(ogdDistrictNames("NCT of Delhi", "South West Delhi"), ["Delhi"]);
  assert.deepEqual(sourceDistrictNames("Delhi", "Shahdara", ["Delhi"]), ["Delhi"]);
  // It belongs to no single district, so the map is not asked for one.
  assert.equal(districtForSourceName("Delhi", "Delhi"), null);
});

test("one source name can stand for a group of districts", async () => {
  const { districtForSourceName, ogdDistrictNames, sourceDistrictNames } =
    await import("./india.ts");
  // The source keeps the mandis of both Mumbai districts under "Mumbai".
  assert.deepEqual(ogdDistrictNames("Maharashtra", "Mumbai City"), ["Mumbai"]);
  assert.deepEqual(ogdDistrictNames("Maharashtra", "Mumbai Suburban"), ["Mumbai"]);
  assert.deepEqual(sourceDistrictNames("Maharashtra", "Mumbai Suburban", ["Mumbai", "Thane"]), [
    "Mumbai",
  ]);
  assert.deepEqual(sourceDistrictNames("Maharashtra", "Thane", ["Mumbai", "Thane"]), ["Thane"]);
  // It belongs to neither alone, so the map is not asked for one.
  assert.equal(districtForSourceName("Maharashtra", "Mumbai"), null);
});

test("districts known by an older or a shorter name are found under it", async () => {
  const { districtForSourceName, ogdDistrictNames, sourceDistrictNames } =
    await import("./india.ts");
  assert.deepEqual(ogdDistrictNames("Punjab", "Sahibzada Ajit Singh Nagar"), ["Mohali"]);
  assert.deepEqual(ogdDistrictNames("Punjab", "Shaheed Bhagat Singh Nagar"), ["Nawanshahr"]);
  assert.deepEqual(ogdDistrictNames("Punjab", "Sri Muktsar Sahib"), ["Muktsar"]);
  assert.deepEqual(ogdDistrictNames("Punjab", "Tarn Taran"), ["Tarntaran"]);
  // The source wrote this one in small letters for a while; both writings are asked for.
  assert.deepEqual(ogdDistrictNames("Punjab", "Kapurthala"), ["Kapurthala", "kapurthala"]);
  assert.deepEqual(ogdDistrictNames("Odisha", "Kendujhar"), ["Keonjhar"]);
  assert.deepEqual(ogdDistrictNames("Odisha", "Subarnapur"), ["Sonepur"]);
  assert.deepEqual(ogdDistrictNames("Puducherry", "Puducherry"), ["Pondicherry"]);
  assert.deepEqual(ogdDistrictNames("Meghalaya", "Ri Bhoi"), ["Nongpoh (R-Bhoi)"]);
  assert.deepEqual(ogdDistrictNames("Madhya Pradesh", "Narmadapuram"), [
    "Narmadapuram",
    "Hoshangabad",
  ]);
  assert.deepEqual(ogdDistrictNames("Maharashtra", "Ahmednagar"), ["Ahilyanagar", "Ahmednagar"]);
  assert.equal(districtForSourceName("Maharashtra", "Ahilyanagar"), "Ahmednagar");
  // "Vashim" is as close to Nashik as to Washim by letters; the list settles it.
  assert.equal(districtForSourceName("Maharashtra", "Vashim"), "Washim");
  assert.deepEqual(sourceDistrictNames("Maharashtra", "Nashik", ["Vashim", "Nashik"]), ["Nashik"]);
  assert.equal(districtForSourceName("Madhya Pradesh", "Badwani"), "Barwani");
});

test("old and new names of renamed districts both lead to the district", async () => {
  const { districtForSourceName, ogdDistrictNames, sourceDistrictNames } =
    await import("./india.ts");
  assert.deepEqual(ogdDistrictNames("Karnataka", "Bengaluru Urban"), ["Bengaluru", "Bangalore"]);
  assert.deepEqual(ogdDistrictNames("Karnataka", "Shivamogga"), ["Shivamogga", "Shimoga"]);
  assert.equal(districtForSourceName("Karnataka", "Bengaluru South"), "Ramanagara");
  assert.equal(districtForSourceName("Karnataka", "Mangalore(Dakshin Kannad)"), "Dakshina Kannada");
  // "Bengaluru" is the city district; the rural district keeps only its own name.
  assert.deepEqual(
    sourceDistrictNames("Karnataka", "Bengaluru Rural", [
      "Bengaluru",
      "Bengaluru Rural",
      "Bengaluru South",
    ]),
    ["Bengaluru Rural"],
  );
  assert.deepEqual(ogdDistrictNames("Haryana", "Gurugram"), ["Gurgaon"]);
  assert.deepEqual(ogdDistrictNames("Haryana", "Nuh"), ["Mewat"]);
  assert.deepEqual(ogdDistrictNames("Gujarat", "Kutch"), ["Kachchh"]);
  assert.deepEqual(ogdDistrictNames("Chhattisgarh", "Koriya"), ["Koriya", "Koria"]);
  // "Koria" is one letter from Korba as well; the list settles it.
  assert.equal(districtForSourceName("Chhattisgarh", "Koria"), "Koriya");
  assert.deepEqual(sourceDistrictNames("Chhattisgarh", "Korba", ["Koria", "Korba"]), ["Korba"]);
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
