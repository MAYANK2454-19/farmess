import assert from "node:assert/strict";
import test from "node:test";

import {
  countBuyerOfferStatuses,
  effectiveBuyerOfferStatus,
  filterBuyerOfferHistory,
  type BuyerOfferHistoryItem,
} from "./buyer-offer-history-filters.ts";

function offer(overrides: Partial<BuyerOfferHistoryItem> = {}): BuyerOfferHistoryItem {
  return {
    id: "offer-1",
    quantity: 25,
    unit: "quintal",
    price_paise_per_quintal: 250000,
    valid_until: "2026-12-01T00:00:00.000Z",
    status: "pending",
    terms: "Pickup at Jammu market gate",
    created_at: "2026-11-22T12:00:00.000Z",
    is_expired: false,
    ...overrides,
  };
}

test("expired pending offers are shown as expired without mutating API state", () => {
  const item = offer({ is_expired: true });
  assert.equal(effectiveBuyerOfferStatus(item), "expired");
  assert.equal(item.status, "pending");
});

test("status counts use the complete offer history", () => {
  const counts = countBuyerOfferStatuses([
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

test("pending and expired filters keep actionable and expired offers separate", () => {
  const items = [offer({ id: "live" }), offer({ id: "expired", is_expired: true })];

  assert.deepEqual(
    filterBuyerOfferHistory(items, { status: "pending", query: "", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["live"],
  );
  assert.deepEqual(
    filterBuyerOfferHistory(items, { status: "expired", query: "", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["expired"],
  );
});

test("search matches all terms across offer terms, quantity, unit and quoted price", () => {
  const items = [
    offer({ id: "pickup", terms: "Pickup at Jammu market gate" }),
    offer({ id: "delivery", terms: "Delivery required at warehouse" }),
  ];

  assert.deepEqual(
    filterBuyerOfferHistory(items, {
      status: "all",
      query: "JAMMU pickup",
      sort: "newest",
    }).map((item) => item.id),
    ["pickup"],
  );
  assert.equal(
    filterBuyerOfferHistory(items, {
      status: "all",
      query: "25 quintal 2500.00",
      sort: "newest",
    }).length,
    2,
  );
  assert.equal(
    filterBuyerOfferHistory(items, {
      status: "all",
      query: "pickup warehouse",
      sort: "newest",
    }).length,
    0,
  );
});

test("search can match validity dates and is case-insensitive", () => {
  const items = [offer()];
  assert.equal(
    filterBuyerOfferHistory(items, {
      status: "all",
      query: "2026-12-01",
      sort: "newest",
    }).length,
    1,
  );
  assert.equal(
    filterBuyerOfferHistory(items, {
      status: "all",
      query: "QUINTAL",
      sort: "newest",
    }).length,
    1,
  );
});

test("sorts by sent time in both directions and keeps invalid dates last", () => {
  const items = [
    offer({ id: "older", created_at: "2026-11-20T12:00:00.000Z" }),
    offer({ id: "invalid", created_at: "not-a-date" }),
    offer({ id: "newer", created_at: "2026-11-23T12:00:00.000Z" }),
  ];

  assert.deepEqual(
    filterBuyerOfferHistory(items, { status: "all", query: "", sort: "newest" }).map(
      (item) => item.id,
    ),
    ["newer", "older", "invalid"],
  );
  assert.deepEqual(
    filterBuyerOfferHistory(items, { status: "all", query: "", sort: "oldest" }).map(
      (item) => item.id,
    ),
    ["older", "newer", "invalid"],
  );
});

test("filtering does not mutate the server response array", () => {
  const items = [offer({ id: "a" }), offer({ id: "b" })];
  const before = [...items];

  filterBuyerOfferHistory(items, { status: "all", query: "", sort: "oldest" });
  assert.deepEqual(items, before);
});
