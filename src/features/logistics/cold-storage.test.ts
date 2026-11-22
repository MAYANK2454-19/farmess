import assert from "node:assert/strict";
import test from "node:test";
import {
  planColdStorage,
  type ColdStorageListing,
  type StorageLotCandidate,
} from "./cold-storage.ts";

const listing: ColdStorageListing = {
  id: "storage-1",
  providerId: "provider-1",
  facilityArea: "Jammu",
  availableFrom: "2026-11-23",
  availableUntil: "2026-12-10",
  capacity: 50,
  capacityUnit: "quintal",
  supportedCrops: ["Apple", "Tomato"],
  refrigerated: true,
  temperatureMinC: 2,
  temperatureMaxC: 8,
  ratePaise: 250,
  rateBasis: "per_quintal_day",
  rateValueType: "indicative",
  status: "published",
  verificationState: "verification_pending",
};

const lot = (overrides: Partial<StorageLotCandidate> = {}): StorageLotCandidate => ({
  id: "lot-1",
  crop: "Apple",
  quantity: 2,
  unit: "tonne",
  storageArea: "Jammu",
  arrivalDate: "2026-11-24",
  storageDays: 3,
  requiresColdChain: true,
  requiredTemperatureMinC: 3,
  requiredTemperatureMaxC: 7,
  ...overrides,
});

test("matches compatible produce and calculates an explicitly indicative rate", () => {
  const result = planColdStorage(listing, [lot()]);
  assert.deepEqual(result.eligibleLots.map((item) => item.lotId), ["lot-1"]);
  assert.equal(result.totalQuantityKg, 2000);
  assert.equal(result.remainingCapacityKg, 3000);
  assert.equal(result.eligibleLots[0].estimatedCostPaise, 15000);
  assert.equal(result.eligibleLots[0].costValueType, "indicative");
  assert.equal(result.availabilityLabel, "verification_pending");
  assert.equal(result.bookingStatus, "not_booked");
});

test("rejects mismatched area, crop, date, cold-chain and temperature requirements", () => {
  const result = planColdStorage(listing, [
    lot({ id: "area", storageArea: "Delhi" }),
    lot({ id: "crop", crop: "Potato" }),
    lot({ id: "date", arrivalDate: "2026-12-09", storageDays: 3 }),
    lot({ id: "cold", requiresColdChain: false, requiredTemperatureMinC: null, requiredTemperatureMaxC: null }),
    lot({ id: "temp", requiredTemperatureMinC: -5, requiredTemperatureMaxC: 0 }),
  ]);
  assert.equal(result.eligibleLots.length, 1);
  assert.deepEqual(
    result.rejectedLots.map((item) => item.lotId),
    ["area", "crop", "date", "temp"],
  );
  assert.ok(result.rejectedLots.every((item) => item.reasons.length > 0));
});

test("unknown rates remain unavailable instead of becoming zero", () => {
  const result = planColdStorage(
    { ...listing, ratePaise: null, rateBasis: null },
    [lot()],
  );
  assert.equal(result.eligibleLots[0].estimatedCostPaise, null);
  assert.equal(result.eligibleLots[0].costValueType, "unavailable");
});

test("rejects lots when a required temperature range cannot be verified", () => {
  const result = planColdStorage(
    { ...listing, temperatureMinC: null, temperatureMaxC: null },
    [lot()],
  );
  assert.equal(result.eligibleLots.length, 0);
  assert.ok(result.rejectedLots[0].reasons[0].includes("temperature"));
});

test("capacity is accumulated only for eligible lots", () => {
  const result = planColdStorage(listing, [
    lot({ id: "a", quantity: 30, unit: "quintal" }),
    lot({ id: "b", quantity: 25, unit: "quintal" }),
    lot({ id: "c", quantity: 10, unit: "quintal", crop: "Potato" }),
  ]);
  assert.deepEqual(result.eligibleLots.map((item) => item.lotId), ["a"]);
  assert.deepEqual(result.rejectedLots.map((item) => item.lotId), ["b", "c"]);
  assert.equal(result.remainingCapacityKg, 2000);
});

test("unpublished listings and invalid quantities fail closed", () => {
  const unpublished = planColdStorage(
    { ...listing, status: "paused" },
    [lot()],
  );
  assert.equal(unpublished.eligibleLots.length, 0);

  const invalidQuantity = planColdStorage(listing, [
    lot({ quantity: Number.NaN }),
  ]);
  assert.equal(invalidQuantity.eligibleLots.length, 0);
  assert.ok(invalidQuantity.rejectedLots[0].reasons.some((reason) => reason.includes("quantity")));
});

test("invalid capacity and inconsistent facility temperature range throw", () => {
  assert.throws(() => planColdStorage({ ...listing, capacity: 0 }, []));
  assert.throws(
    () =>
      planColdStorage(
        { ...listing, temperatureMinC: 9, temperatureMaxC: 2 },
        [],
      ),
  );
});
