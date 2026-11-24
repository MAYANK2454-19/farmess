import assert from "node:assert/strict";
import test from "node:test";
import {
  countOperatorRequests,
  filterOperatorRequests,
  type OperatorRequestQueueItem,
} from "./request-queue.ts";

function request(
  id: string,
  status: string,
  created_at: string,
  overrides: Partial<OperatorRequestQueueItem> = {},
): OperatorRequestQueueItem & { id: string } {
  return {
    id,
    status,
    created_at,
    listing: { title: "Cold storage", service_type: "storage" },
    origin_area: "Katra",
    destination_area: "Jammu mandi",
    requested_date: "2026-11-25",
    requested_quantity: 12,
    unit: "quintal",
    message: "Need covered storage",
    ...overrides,
  };
}

const requests = [
  request("1", "pending", "2026-11-24T10:00:00.000Z"),
  request("2", "accepted", "2026-11-24T11:00:00.000Z", {
    listing: { title: "Farm transport", service_type: "transport" },
    message: "Truck for apples",
  }),
  request("3", "cancelled", "2026-11-24T09:00:00.000Z"),
  request("4", "completed", "2026-11-24T08:00:00.000Z"),
  request("5", "declined", "2026-11-24T07:00:00.000Z"),
];

const newest = { status: "all", query: "", sort: "newest" } as const;

test("counts all, pending, accepted and closed requests", () => {
  assert.deepEqual(countOperatorRequests(requests), {
    all: 5,
    pending: 1,
    accepted: 1,
    closed: 3,
  });
});

test("filters by each lifecycle group without losing the all view", () => {
  assert.deepEqual(
    filterOperatorRequests(requests, { ...newest, status: "pending" }).map((item) => item.status),
    ["pending"],
  );
  assert.deepEqual(
    filterOperatorRequests(requests, { ...newest, status: "accepted" }).map((item) => item.status),
    ["accepted"],
  );
  assert.deepEqual(
    filterOperatorRequests(requests, { ...newest, status: "closed" }).map((item) => item.status),
    ["cancelled", "completed", "declined"],
  );
  assert.equal(filterOperatorRequests(requests, newest).length, 5);
});

test("searches across route, listing, quantity and message with all terms", () => {
  assert.deepEqual(
    filterOperatorRequests(requests, { ...newest, query: "truck apples" }).map(
      (item) => item.status,
    ),
    ["accepted"],
  );
  assert.deepEqual(
    filterOperatorRequests(requests, { ...newest, query: "katra 12 quintal" }).length,
    5,
  );
  assert.equal(filterOperatorRequests(requests, { ...newest, query: "missing village" }).length, 0);
});

test("sorts newest and oldest while keeping invalid dates last", () => {
  const withInvalid = [
    request("bad", "pending", "not-a-date"),
    request("old", "pending", "2026-11-20T00:00:00.000Z"),
    request("new", "pending", "2026-11-24T00:00:00.000Z"),
  ];
  assert.deepEqual(
    filterOperatorRequests(withInvalid, { ...newest, status: "pending" }).map((item) => item.id),
    ["new", "old", "bad"],
  );
  assert.deepEqual(
    filterOperatorRequests(withInvalid, { ...newest, status: "pending", sort: "oldest" }).map(
      (item) => item.id,
    ),
    ["old", "new", "bad"],
  );
});

test("does not mutate the original request array and preserves stable ties", () => {
  const tied = [
    request("first", "pending", "2026-11-24T00:00:00.000Z"),
    request("second", "pending", "2026-11-24T00:00:00.000Z"),
  ];
  const original = [...tied];
  assert.deepEqual(
    filterOperatorRequests(tied, newest).map((item) => item.id),
    ["first", "second"],
  );
  assert.deepEqual(tied, original);
});
