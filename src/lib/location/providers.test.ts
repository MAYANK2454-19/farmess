import assert from "node:assert/strict";
import test from "node:test";

import {
  parseIndiaPostResponse,
  parseNominatimReverse,
  parseNominatimSearch,
} from "./providers.ts";

test("India Post responses map to canonical state and district", () => {
  const place = parseIndiaPostResponse("180001", [
    {
      Status: "Success",
      PostOffice: [
        { Name: "Bakshinagar", District: "Jammu", State: "Jammu & Kashmir" },
        { Name: "Dhounthly Bazar", District: "Jammu", State: "Jammu & Kashmir" },
        { Name: "Bakshinagar", District: "Jammu", State: "Jammu & Kashmir" },
      ],
    },
  ]);
  assert.deepEqual(place, {
    pincode: "180001",
    state: "Jammu and Kashmir",
    district: "Jammu",
    postOffices: ["Bakshinagar", "Dhounthly Bazar"],
  });
});

test("unknown PIN codes and malformed responses return null", () => {
  assert.equal(parseIndiaPostResponse("999999", [{ Status: "Error", PostOffice: null }]), null);
  assert.equal(parseIndiaPostResponse("180001", null), null);
  assert.equal(parseIndiaPostResponse("180001", [{ Status: "Success", PostOffice: [] }]), null);
});

test("geocoder results outside India are rejected", () => {
  assert.deepEqual(parseNominatimSearch([{ lat: "32.7255", lon: "74.8626" }]), {
    latitude: 32.7255,
    longitude: 74.8626,
  });
  assert.equal(parseNominatimSearch([{ lat: "51.5", lon: "-0.12" }]), null);
  assert.equal(parseNominatimSearch([]), null);
});

test("reverse geocoding yields state, district, PIN and locality", () => {
  assert.deepEqual(
    parseNominatimReverse({
      address: {
        city: "Jammu",
        state_district: "Jammu district",
        state: "Jammu and Kashmir",
        postcode: "180001",
        country_code: "in",
      },
    }),
    { state: "Jammu and Kashmir", district: "Jammu", pincode: "180001", locality: "Jammu" },
  );
  assert.equal(parseNominatimReverse({ address: { country_code: "pk", state: "Punjab" } }), null);
  assert.equal(parseNominatimReverse({}), null);
});
