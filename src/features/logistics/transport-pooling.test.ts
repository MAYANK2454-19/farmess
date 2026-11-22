import assert from "node:assert/strict";
import test from "node:test";
import {
  planTransportPool,
  type PoolLotCandidate,
  type TransportPoolListing,
} from "./transport-pooling.ts";

const listing: TransportPoolListing = {
  id: "pool-1",
  providerId: "provider-1",
  routeFrom: "Jammu",
  routeTo: "Delhi",
  availableFrom: "2026-11-23",
  availableUntil: "2026-11-25",
  capacity: 10,
  capacityUnit: "quintal",
  supportedCrops: ["Tomato", "Potato"],
  refrigerated: true,
  status: "published",
  verificationState: "verification_pending",
};

const lot = (overrides: Partial<PoolLotCandidate> = {}): PoolLotCandidate => ({
  id: "lot-1",
  crop: "Tomato",
  quantity: 2,
  unit: "tonne",
  pickupArea: "Jammu",
  dropoffArea: "Delhi",
  pickupDate: "2026-11-24",
  requiresColdChain: false,
  ...overrides,
});

test("pool planner converts units and reports capacity without claiming a booking", () => {
  const result = planTransportPool({ ...listing, capacity: 30 }, [lot()]);
  assert.deepEqual(result.eligibleLotIds, ["lot-1"]);
  assert.equal(result.totalQuantityKg, 2000);
  assert.equal(result.capacityKg, 3000);
  assert.equal(result.remainingCapacityKg, 1000);
  assert.equal(result.utilisationPercent, 66.7);
  assert.equal(result.bookingStatus, "not_booked");
});

test("accepts compatible lots while rejecting a lot that would exceed remaining capacity", () => {
  const result = planTransportPool(listing, [
    lot({ id: "lot-a", quantity: 4, unit: "quintal" }),
    lot({ id: "lot-b", quantity: 5, unit: "quintal" }),
    lot({ id: "lot-c", quantity: 2, unit: "quintal" }),
  ]);
  assert.deepEqual(result.eligibleLotIds, ["lot-a", "lot-b"]);
  assert.equal(result.totalQuantityKg, 900);
  assert.equal(result.remainingCapacityKg, 100);
  assert.deepEqual(result.rejectedLots[0].reasons, [
    "Adding this lot would exceed the remaining vehicle capacity.",
  ]);
});

test("rejects route, date, crop and cold-chain mismatches with explanations", () => {
  const result = planTransportPool(listing, [
    lot({ id: "route", pickupArea: "Srinagar" }),
    lot({ id: "date", pickupDate: "2026-11-26" }),
    lot({ id: "crop", crop: "Apple" }),
    lot({ id: "cold", requiresColdChain: true }),
  ]);
  assert.equal(result.eligibleLotIds.length, 0);
  assert.ok(result.rejectedLots.every((entry) => entry.reasons.length > 0));
});

test("unpublished or unverified listings never appear as confirmed bookings", () => {
  const unpublished = planTransportPool({ ...listing, status: "paused" }, [
    lot({ quantity: 1, unit: "quintal" }),
  ]);
  assert.equal(unpublished.eligibleLotIds.length, 0);
  assert.equal(unpublished.bookingStatus, "not_booked");

  const pending = planTransportPool(listing, [lot({ quantity: 1, unit: "quintal" })]);
  assert.equal(pending.availabilityLabel, "verification_pending");
  assert.equal(pending.bookingStatus, "not_booked");
});

test("invalid lot quantity and malformed date are rejected safely", () => {
  const result = planTransportPool(listing, [
    lot({ id: "bad-qty", quantity: Number.NaN }),
    lot({ id: "bad-date", pickupDate: "not-a-date" }),
  ]);
  assert.equal(result.rejectedLots.length, 2);
  assert.ok(result.rejectedLots[0].reasons.some((reason) => reason.includes("quantity")));
  assert.ok(result.rejectedLots[1].reasons.some((reason) => reason.includes("date")));
});

test("invalid listing capacity fails closed", () => {
  assert.throws(() => planTransportPool({ ...listing, capacity: 0 }, []));
  assert.throws(() => planTransportPool({ ...listing, capacityUnit: "crate" as never }, []));
});
