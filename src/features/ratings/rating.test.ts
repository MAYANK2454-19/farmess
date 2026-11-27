import assert from "node:assert/strict";
import test from "node:test";

import { formatRating, parseRatingRequest, reputationPoints, toRatingSummary } from "./rating.ts";

const ID = "3f2c9a52-7d7b-4c0e-9f0a-5a2d0c1b7e11";

test("a valid rating request is accepted and the comment is trimmed", () => {
  const parsed = parseRatingRequest({
    contextType: "sale",
    contextId: ID,
    stars: 4,
    comment: "  Paid on time  ",
  });
  assert.deepEqual(parsed, {
    ok: true,
    value: { contextType: "sale", contextId: ID, stars: 4, comment: "Paid on time" },
  });
  const noComment = parseRatingRequest({ contextType: "service_request", contextId: ID, stars: 5 });
  assert.equal(noComment.ok && noComment.value.comment, null);
});

test("invalid rating requests are rejected with a plain message", () => {
  const bad = [
    null,
    [],
    { contextType: "lot", contextId: ID, stars: 3 },
    { contextType: "sale", contextId: "not-an-id", stars: 3 },
    { contextType: "sale", contextId: ID, stars: 0 },
    { contextType: "sale", contextId: ID, stars: 6 },
    { contextType: "sale", contextId: ID, stars: 3.5 },
    { contextType: "sale", contextId: ID, stars: "5" },
    { contextType: "sale", contextId: ID, stars: 3, comment: "x".repeat(301) },
    { contextType: "sale", contextId: ID, stars: 3, ratee: "someone" },
  ];
  for (const body of bad) assert.equal(parseRatingRequest(body).ok, false, JSON.stringify(body));
});

test("summaries from the database are cleaned", () => {
  assert.deepEqual(toRatingSummary("4.50", 2), { average: 4.5, count: 2 });
  assert.deepEqual(toRatingSummary(null, 0), { average: null, count: 0 });
  assert.deepEqual(toRatingSummary(undefined, null), { average: null, count: 0 });
  assert.equal(formatRating({ average: 4.5, count: 2 }), "4.5 out of 5 (2 ratings)");
  assert.equal(formatRating({ average: 5, count: 1 }), "5.0 out of 5 (1 rating)");
  assert.equal(formatRating(null), "No ratings yet");
});

test("reputation moves a recommendation by at most five points either way", () => {
  assert.equal(reputationPoints({ average: null, count: 0 }), 0);
  assert.equal(reputationPoints(null), 0);
  assert.equal(reputationPoints({ average: 5, count: 10 }), 5);
  assert.equal(reputationPoints({ average: 1, count: 10 }), -5);
  assert.equal(reputationPoints({ average: 3.5, count: 10 }), 0);
  assert.ok(reputationPoints({ average: 4.5, count: 5 }) > 0);
});

test("one or two ratings count only partly", () => {
  const one = reputationPoints({ average: 5, count: 1 });
  const two = reputationPoints({ average: 5, count: 2 });
  const three = reputationPoints({ average: 5, count: 3 });
  assert.ok(one > 0 && one < two && two < three);
  assert.equal(three, 5);
  assert.ok(
    reputationPoints({ average: 1, count: 1 }) > -2,
    "a single bad review cannot sink a provider",
  );
});
