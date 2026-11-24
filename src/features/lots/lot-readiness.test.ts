import assert from "node:assert/strict";
import test from "node:test";
import { buildLotReadiness, type LotReadinessInput } from "./lot-readiness.ts";
function lot(overrides: Partial<LotReadinessInput> = {}): LotReadinessInput {
  return {
    id: "lot-1",
    crop: "Tomato",
    available_from: "2026-11-24",
    sell_by: "2026-11-29",
    status: "published",
    ...overrides,
  };
}
test("classifies a passed sell-by date as expired", () => {
  const [result] = buildLotReadiness([lot({ sell_by: "2026-11-23" })], "2026-11-24");
  assert.equal(result.readiness, "expired");
  assert.equal(result.daysUntilSellBy, -1);
});
test("includes today through three days ahead in due-soon reminders", () => {
  const results = buildLotReadiness(
    [
      lot({ id: "today", sell_by: "2026-11-24" }),
      lot({ id: "three", sell_by: "2026-11-27" }),
      lot({ id: "four", sell_by: "2026-11-28" }),
    ],
    "2026-11-24",
  );
  assert.deepEqual(
    results.map((item) => item.readiness),
    ["due_soon", "due_soon", "available"],
  );
});
test("keeps a future availability date in the upcoming state", () => {
  const [result] = buildLotReadiness(
    [lot({ available_from: "2026-11-26", sell_by: "2026-11-29" })],
    "2026-11-24",
  );
  assert.equal(result.readiness, "upcoming");
  assert.equal(result.daysUntilAvailable, 2);
});
test("treats availability and sell-by dates inclusively", () => {
  const [result] = buildLotReadiness(
    [lot({ available_from: "2026-11-24", sell_by: "2026-11-24" })],
    "2026-11-24",
  );
  assert.equal(result.readiness, "due_soon");
});
test("drops invalid dates and reversed date windows", () => {
  const results = buildLotReadiness(
    [
      lot({ id: "invalid", sell_by: "2026-02-30" }),
      lot({ id: "reversed", available_from: "2026-11-29", sell_by: "2026-11-28" }),
      lot({ id: "valid" }),
    ],
    "2026-11-24",
  );
  assert.deepEqual(
    results.map((item) => item.id),
    ["valid"],
  );
});
test("sorts by urgency, nearest sell-by date and crop name", () => {
  const results = buildLotReadiness(
    [
      lot({ id: "available", crop: "Apple", sell_by: "2026-12-01" }),
      lot({ id: "due-later", crop: "Potato", sell_by: "2026-11-27" }),
      lot({ id: "expired", sell_by: "2026-11-20" }),
      lot({ id: "due-earlier", crop: "Onion", sell_by: "2026-11-25" }),
      lot({ id: "upcoming", available_from: "2026-11-26", sell_by: "2026-11-30" }),
    ],
    "2026-11-24",
  );
  assert.deepEqual(
    results.map((item) => item.id),
    ["expired", "due-earlier", "due-later", "upcoming", "available"],
  );
});
test("rejects an invalid reference calendar date", () => {
  assert.throws(() => buildLotReadiness([lot()], "2026-13-01"), /valid local calendar date/);
});
