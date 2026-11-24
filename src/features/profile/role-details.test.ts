import assert from "node:assert/strict";
import test from "node:test";

import { parseRoleDetailsPatch } from "./role-details.ts";

test("a farmer can record own transport with vehicle details", () => {
  const result = parseRoleDetailsPatch(
    {
      own_transport: true,
      transport_vehicle_type: "tractor_trolley",
      transport_capacity_quintal: 25,
      farm_size_acres: 4.5,
      primary_crops: [" Tomato ", "Apple", "Tomato", ""],
    },
    "farmer",
  );
  assert.deepEqual(result, {
    ok: true,
    update: {
      own_transport: true,
      transport_vehicle_type: "tractor_trolley",
      transport_capacity_quintal: 25,
      farm_size_acres: 4.5,
      primary_crops: ["Tomato", "Apple"],
    },
  });
});

test("choosing no own transport clears vehicle details", () => {
  const result = parseRoleDetailsPatch(
    { own_transport: false, transport_vehicle_type: "truck", transport_capacity_quintal: 50 },
    "farmer",
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.update.transport_vehicle_type, null);
    assert.equal(result.update.transport_capacity_quintal, null);
  }
});

test("vehicle details without own transport are rejected", () => {
  const result = parseRoleDetailsPatch({ transport_vehicle_type: "truck" }, "farmer");
  assert.equal(result.ok, false);
});

test("out-of-range and unknown values are rejected", () => {
  for (const body of [
    { own_transport: true, transport_capacity_quintal: 0 },
    { own_transport: true, transport_capacity_quintal: 1001 },
    { own_transport: true, transport_vehicle_type: "spaceship" },
    { farm_size_acres: -2 },
    { primary_crops: "Tomato" },
    { primary_crops: Array.from({ length: 11 }, (_, i) => `Crop ${i}`) },
  ]) {
    assert.equal(parseRoleDetailsPatch(body, "farmer").ok, false, JSON.stringify(body));
  }
});

test("roles cannot set another role's details", () => {
  assert.equal(parseRoleDetailsPatch({ farm_size_acres: 3 }, "buyer").ok, false);
  assert.equal(parseRoleDetailsPatch({ buyer_type: "trader" }, "farmer").ok, false);
  assert.equal(parseRoleDetailsPatch({ operator_fleet_size: 2 }, "buyer").ok, false);
  assert.equal(parseRoleDetailsPatch({ organisation_name: "X" }, "admin").ok, false);
});

test("a buyer records organisation and buyer type", () => {
  assert.deepEqual(
    parseRoleDetailsPatch(
      { organisation_name: "  Jammu Fresh Traders ", buyer_type: "trader" },
      "buyer",
    ),
    { ok: true, update: { organisation_name: "Jammu Fresh Traders", buyer_type: "trader" } },
  );
});

test("an operator records services, fleet and cold chain", () => {
  const result = parseRoleDetailsPatch(
    {
      organisation_name: "Valley Cold Chain",
      operator_service_types: ["transport", "cold_storage", "transport"],
      operator_fleet_size: 6,
      operator_cold_chain: true,
    },
    "operator",
  );
  assert.deepEqual(result, {
    ok: true,
    update: {
      organisation_name: "Valley Cold Chain",
      operator_service_types: ["transport", "cold_storage"],
      operator_fleet_size: 6,
      operator_cold_chain: true,
    },
  });
  assert.equal(parseRoleDetailsPatch({ operator_fleet_size: 2.5 }, "operator").ok, false);
  assert.equal(
    parseRoleDetailsPatch({ operator_service_types: ["teleport"] }, "operator").ok,
    false,
  );
});

test("empty optional values are stored as null", () => {
  assert.deepEqual(parseRoleDetailsPatch({ farm_size_acres: "", primary_crops: [] }, "farmer"), {
    ok: true,
    update: { farm_size_acres: null, primary_crops: null },
  });
});
