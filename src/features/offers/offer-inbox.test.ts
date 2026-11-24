import assert from "node:assert/strict";
import test from "node:test";

import {
  countOfferInboxStatuses,
  effectiveOfferInboxStatus,
  filterOfferInbox,
  type OfferInboxItem,
} from "./offer-inbox.ts";

function offer(overrides: Partial<OfferInboxItem> = {}): OfferInboxItem {
  return {
    id: "offer-1",
    lot_id: "lot-1",
    quantity: 25,
    unit: "quintal",
    price_paise_per_quintal: 250000,
    valid_until: "2026-12-01T00:00:00.000Z",
    status: "pending",
    terms: "Pickup at farm gate",
    created_at: "2026-11-22T12:00:00.000Z",
    lot: { id: "lot-1", crop: "Wheat", variety: "Sharbati" },
    is_expired: false,
    ...overrides,
  };
}

test("expired pending offers are presented as expired without changing persisted status", () => {
  const item = offer({ is_expired: true });
  assert.equal(effectiveOfferInboxStatus(item), "expired");
  assert.equal(item.status, "pending");
});

test("counts effective statuses across the complete inbox", () => {
  const counts = countOfferInboxStatuses([
    offer({ id: "pending" }),
    offer({ id: "expired", is_expired: true }),
    offer({ id: "accepted", status: "accepted" }),
    offer({ id: "declined", status: "declined" }),
    offer({ id: "withdrawn", status: "withdrawn" }),
  ]);

  assert.deepEqual(counts, {
    all: 5,
    pending: 1,
    accepted: 1,
    declined: 1,
    withdrawn: 1,
    expired: 1,
  });
});

test("status filter separates expired pending offers from actionable pending offers", () => {
  const items = [offer({ id: "live" }), offer({ id: "expired", is_expired: true })];

  assert.deepEqual(
    filterOfferInbox(items, { status: "pending", query: "", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["live"],
  );
  assert.deepEqual(
    filterOfferInbox(items, { status: "expired", query: "", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["expired"],
  );
});

test("search matches crop, variety, terms, quantity, unit and quoted price", () => {
  const items = [
    offer({ id: "wheat", lot: { id: "lot-1", crop: "Wheat", variety: "Sharbati" } }),
    offer({ id: "rice", lot: { id: "lot-2", crop: "Rice", variety: "Basmati" } }),
  ];

  assert.deepEqual(
    filterOfferInbox(items, { status: "all", query: "wheat sharbati", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["wheat"],
  );
  assert.deepEqual(
    filterOfferInbox(items, { status: "all", query: "pickup quintal", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["wheat", "rice"],
  );
  assert.deepEqual(
    filterOfferInbox(items, { status: "all", query: "2500.00", sort: "newest" }).length,
    2,
  );
});

test("all search terms must match and search is case-insensitive", () => {
  const items = [offer()];
  assert.equal(
    filterOfferInbox(items, { status: "all", query: "WHEAT SHARBATI", sort: "newest" }).length,
    1,
  );
  assert.equal(
    filterOfferInbox(items, { status: "all", query: "wheat rice", sort: "newest" }).length,
    0,
  );
});

test("sorts newest and oldest while preserving invalid timestamps at the end", () => {
  const items = [
    offer({ id: "older", created_at: "2026-11-20T12:00:00.000Z" }),
    offer({ id: "invalid", created_at: "not-a-date" }),
    offer({ id: "newer", created_at: "2026-11-23T12:00:00.000Z" }),
  ];

  assert.deepEqual(
    filterOfferInbox(items, { status: "all", query: "", sort: "newest" }).map((item) => item.id),
    ["newer", "older", "invalid"],
  );
  assert.deepEqual(
    filterOfferInbox(items, { status: "all", query: "", sort: "oldest" }).map((item) => item.id),
    ["older", "newer", "invalid"],
  );
});

test("filtering does not mutate the API result array", () => {
  const items = [offer({ id: "a" }), offer({ id: "b" })];
  const before = [...items];
  filterOfferInbox(items, { status: "all", query: "", sort: "oldest" });
  assert.deepEqual(items, before);
});
