import assert from "node:assert/strict";
import test from "node:test";
import { rankLogisticsCandidates, type NearbyServiceCandidate } from "./recommendations.ts";

const base = (overrides: Partial<NearbyServiceCandidate> = {}): NearbyServiceCandidate => ({
  id: "listing-1",
  title: "Local refrigerated transport",
  service_type: "transport",
  service_area: "Jammu",
  destination_area: "Udhampur",
  description: null,
  price_paise: 250000,
  rate_basis: "per_trip",
  capacity_quantity: 20,
  capacity_unit: "quintal",
  available_from: "2026-11-24",
  available_until: "2026-11-28",
  service_radius_km: 50,
  service_radius_match: true,
  crop_suitability: ["Tomato"],
  cold_chain_available: true,
  verification_state: "platform_verified",
  latitude: 32.7266,
  longitude: 74.857,
  destination_latitude: 32.916,
  destination_longitude: 75.141,
  distance_meters: 2500,
  capacity_match: true,
  crop_match: true,
  date_match: true,
  cold_chain_match: true,
  ...overrides,
});

const requirements = {
  crop: "Tomato",
  requiredQuantity: 5,
  unit: "quintal" as const,
  requiredDate: "2026-11-25",
  requiresColdChain: true,
  maximumRadiusMeters: 25_000,
};

test("ranks a fully compatible and platform-verified provider as recommended", () => {
  const [result] = rankLogisticsCandidates([base()], requirements);
  assert.equal(result.status, "recommended");
  assert.equal(result.bookingStatus, "not_booked");
  assert.equal(result.method, "explainable-heuristic");
  assert.equal(result.rankingVersion, "rules-v2");
  assert.equal(result.distanceBasis, "straight_line");
  assert.ok(result.score >= 70);
  assert.ok(result.reasons.some((reason) => reason.includes("cold-chain")));
});

test("unknown provider details remain needs-confirmation, never silently match", () => {
  const [result] = rankLogisticsCandidates(
    [
      base({
        capacity_match: null,
        crop_match: null,
        date_match: null,
        cold_chain_match: null,
        verification_state: "unverified",
      }),
    ],
    requirements,
  );
  assert.equal(result.status, "needs_confirmation");
  assert.ok(result.unknowns.length >= 4);
});

test("hard conflicts exclude a listing", () => {
  const [result] = rankLogisticsCandidates([base({ capacity_match: false })], requirements);
  assert.equal(result.status, "excluded");
  assert.ok(result.reasons.some((reason) => reason.includes("capacity")));
});

test("a cold-chain mismatch excludes a refrigerated requirement", () => {
  const [result] = rankLogisticsCandidates([base({ cold_chain_match: false })], requirements);
  assert.equal(result.status, "excluded");
  assert.ok(result.reasons.some((reason) => reason.includes("Cold-chain")));
});

test("unsuitable crop and date are excluded independently", () => {
  const results = rankLogisticsCandidates(
    [base({ crop_match: false }), base({ id: "date", date_match: false })],
    requirements,
  );
  assert.ok(results.every((result) => result.status === "excluded"));
});

test("incomparable or missing pricing is not treated as a zero-cost rate", () => {
  const [result] = rankLogisticsCandidates(
    [base({ price_paise: null, rate_basis: "quote_required" })],
    requirements,
  );
  assert.equal(result.scoreBreakdown.pricingTransparency, 0);
  assert.ok(result.unknowns.some((reason) => reason.includes("rate")));
});

test("a suspended listing is excluded", () => {
  const [result] = rankLogisticsCandidates(
    [base({ verification_state: "suspended" })],
    requirements,
  );
  assert.equal(result.status, "excluded");
});

test("nearer candidates sort first when all other fields tie", () => {
  const results = rankLogisticsCandidates(
    [base({ id: "far", distance_meters: 15_000 }), base({ id: "near", distance_meters: 500 })],
    requirements,
  );
  assert.equal(results[0].listing.id, "near");
});

test("rejects invalid search radius and malformed required quantity", () => {
  assert.throws(() =>
    rankLogisticsCandidates([base()], { ...requirements, maximumRadiusMeters: 100 }),
  );
  assert.throws(() => rankLogisticsCandidates([base()], { ...requirements, requiredQuantity: 0 }));
});

test("provider's stated service radius is a hard constraint", () => {
  const [outside] = rankLogisticsCandidates([base({ service_radius_match: false })], requirements);
  assert.equal(outside.status, "excluded");
  assert.ok(
    outside.reasons.some((reason) =>
      reason.includes("outside the provider's stated service radius"),
    ),
  );

  const [unknown] = rankLogisticsCandidates([base({ service_radius_match: null })], requirements);
  assert.equal(unknown.status, "needs_confirmation");
  assert.ok(unknown.unknowns.some((reason) => reason.includes("maximum service radius")));
});

test("provider search radius match contributes to explanation and score", () => {
  const [matched] = rankLogisticsCandidates([base({ service_radius_match: true })], requirements);
  assert.equal(matched.scoreBreakdown.serviceCoverage, 10);
  assert.ok(
    matched.reasons.some((reason) =>
      reason.includes("within the provider's stated service radius"),
    ),
  );
});

test("road distance, when known, decides proximity instead of straight-line distance", () => {
  // A is nearer as the crow flies but needs a long detour by road.
  const a = base({ id: "a", distance_meters: 4_000 });
  const b = base({ id: "b", distance_meters: 9_000 });
  const routes = {
    a: { distanceMeters: 30_000, durationSeconds: 3_000 },
    b: { distanceMeters: 11_000, durationSeconds: 900 },
  };
  const ranked = rankLogisticsCandidates([a, b], requirements, routes);
  assert.deepEqual(
    ranked.map((r) => r.listing.id),
    ["b", "a"],
  );
  assert.equal(ranked[0].distanceBasis, "road");
  assert.ok(ranked[0].reasons.some((reason) => reason.includes("11 km by road")));
  assert.deepEqual(ranked[0].roadRoute, routes.b);
});

test("per-km transport gets an estimated trip cost from the road distance", () => {
  const [result] = rankLogisticsCandidates(
    [base({ rate_basis: "per_km", price_paise: 3_500 })],
    requirements,
    { "listing-1": { distanceMeters: 12_400, durationSeconds: 1_200 } },
  );
  assert.equal(result.estimatedTripCostPaise, 43_400);
  const [withoutRoute] = rankLogisticsCandidates(
    [base({ rate_basis: "per_km", price_paise: 3_500 })],
    requirements,
  );
  assert.equal(withoutRoute.estimatedTripCostPaise, null);
  assert.equal(withoutRoute.distanceBasis, "straight_line");
});
