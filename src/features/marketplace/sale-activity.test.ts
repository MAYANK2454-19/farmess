import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSaleTimeline,
  validateSaleActivityEvent,
  type SaleActivityEvent,
} from "./sale-activity.ts";

const event = (
  overrides: Partial<SaleActivityEvent> = {},
): SaleActivityEvent =>
  ({
    id: "event-1",
    saleId: "sale-1",
    lotId: "lot-1",
    actorId: "farmer-1",
    eventType: "offer_accepted",
    eventStatus: "recorded",
    occurredAt: "2026-11-22T10:00:00.000Z",
    createdAt: "2026-11-22T10:01:00.000Z",
    ...overrides,
  }) as SaleActivityEvent;

test("builds a chronological timeline without mutating the source events", () => {
  const later = event({
    id: "delivery",
    eventType: "delivery_recorded",
    occurredAt: "2026-11-23T12:00:00.000Z",
  });
  const earlier = event({
    id: "accepted",
    occurredAt: "2026-11-22T10:00:00.000Z",
  });
  const source = [later, earlier];

  const timeline = buildSaleTimeline("sale-1", source);

  assert.deepEqual(
    timeline.map((entry) => entry.event.id),
    ["accepted", "delivery"],
  );
  assert.deepEqual(source, [later, earlier]);
});

test("excludes events belonging to another sale", () => {
  const timeline = buildSaleTimeline("sale-1", [
    event(),
    event({ id: "other", saleId: "sale-2" }),
  ]);

  assert.deepEqual(
    timeline.map((entry) => entry.event.id),
    ["event-1"],
  );
});

test("uses stable creation-time ordering for equal event times", () => {
  const timeline = buildSaleTimeline("sale-1", [
    event({
      id: "b",
      createdAt: "2026-11-22T10:02:00.000Z",
    }),
    event({
      id: "a",
      createdAt: "2026-11-22T10:01:00.000Z",
    }),
  ]);

  assert.deepEqual(
    timeline.map((entry) => entry.event.id),
    ["a", "b"],
  );
});

test("renders payment status as externally reported, not Farmess-verified", () => {
  const timeline = buildSaleTimeline("sale-1", [
    event({
      eventType: "payment_status_reported",
      reportedStatus: "paid",
    }),
  ]);

  assert.equal(timeline[0].paymentVerification, "externally_reported");
  assert.match(timeline[0].label, /Not verified or processed by Farmess/);
});

test("labels disputed milestones clearly", () => {
  const timeline = buildSaleTimeline("sale-1", [
    event({ eventStatus: "disputed" }),
  ]);

  assert.match(timeline[0].label, /^Disputed/);
});

test("validates identifiers, timestamps and weighment quantity", () => {
  const invalid = event({
    actorId: " ",
    occurredAt: "not-a-date",
    eventType: "weighment_recorded",
    quantity: 0,
    unit: "kg",
  });

  const errors = validateSaleActivityEvent(invalid);

  assert.ok(errors.some((error) => error.includes("actorId")));
  assert.ok(errors.some((error) => error.includes("occurrence time")));
  assert.ok(errors.some((error) => error.includes("Weighment")));
});

test("rejects invalid events in the selected sale timeline", () => {
  assert.throws(
    () =>
      buildSaleTimeline("sale-1", [
        event({ createdAt: "invalid-time" }),
      ]),
    /Invalid sale activity event/,
  );
});

test("requires a sale ID for timeline construction", () => {
  assert.throws(() => buildSaleTimeline(" ", []), /sale ID is required/);
});
