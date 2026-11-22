import assert from "node:assert/strict";
import test from "node:test";
import {
  matchProduceLot,
  transitionLogisticsRequest,
  transitionOffer,
  type BuyerRequirementForMatching,
  type LogisticsRequestForTransition,
  type OfferForTransition,
  type ProduceLotForMatching,
} from "./domain.ts";

const lot: ProduceLotForMatching = {
  id: "lot-1",
  crop: "Tomato",
  variety: "Hybrid",
  grade: "A",
  quantity: 2,
  unit: "quintal",
  locationArea: "Jammu",
  availableAt: "2026-11-23T00:00:00.000Z",
  sellBy: "2026-11-26T00:00:00.000Z",
  status: "published",
};

const requirement: BuyerRequirementForMatching = {
  id: "req-1",
  crop: "tomato",
  variety: "Hybrid",
  grade: "A",
  quantity: 150,
  unit: "kg",
  locationArea: "jammu",
  requiredAt: "2026-11-24T00:00:00.000Z",
};

test("matching accepts equivalent quantity units and case-insensitive fields", () => {
  const result = matchProduceLot(lot, requirement);
  assert.equal(result.status, "match");
  assert.ok(result.reasons.some((reason) => reason.includes("quantity")));
});

test("matching returns partial rather than inventing missing variety information", () => {
  const result = matchProduceLot({ ...lot, variety: null }, requirement);
  assert.equal(result.status, "partial");
  assert.ok(result.unknowns.some((reason) => reason.includes("variety")));
});

test("matching rejects a known crop or location mismatch", () => {
  assert.equal(matchProduceLot(lot, { ...requirement, crop: "Potato" }).status, "no_match");
  assert.equal(
    matchProduceLot(lot, { ...requirement, locationArea: "Srinagar" }).status,
    "no_match",
  );
});

test("unpublished lots are never returned as a match", () => {
  assert.equal(matchProduceLot({ ...lot, status: "draft" }, requirement).status, "no_match");
});

const offer: OfferForTransition = {
  id: "offer-1",
  buyerId: "buyer-1",
  farmerId: "farmer-1",
  validUntil: "2026-11-25T00:00:00.000Z",
  status: "pending",
};

test("only the owning farmer can accept an unexpired offer", () => {
  assert.equal(
    transitionOffer(offer, { id: "farmer-2", role: "farmer" }, "accept", new Date("2026-11-24"))
      .changed,
    false,
  );
  assert.deepEqual(
    transitionOffer(
      offer,
      { id: "farmer-1", role: "farmer" },
      "accept",
      new Date("2026-11-24"),
    ),
    { status: "accepted", changed: true },
  );
});

test("buyer can withdraw only their own pending offer", () => {
  assert.equal(
    transitionOffer(offer, { id: "buyer-2", role: "buyer" }, "withdraw", new Date("2026-11-24"))
      .changed,
    false,
  );
  assert.equal(
    transitionOffer(offer, { id: "buyer-1", role: "buyer" }, "withdraw", new Date("2026-11-24"))
      .status,
    "withdrawn",
  );
});

test("expired offers cannot be accepted even if the UI still shows the action", () => {
  assert.deepEqual(
    transitionOffer(offer, { id: "farmer-1", role: "farmer" }, "accept", new Date("2026-11-26")),
    { status: "expired", changed: true, reason: "Offer validity has ended." },
  );
});

test("terminal offers cannot be changed again", () => {
  assert.equal(
    transitionOffer({ ...offer, status: "declined" }, { id: "farmer-1", role: "farmer" }, "accept")
      .changed,
    false,
  );
});

const request: LogisticsRequestForTransition = {
  id: "request-1",
  farmerId: "farmer-1",
  providerId: "provider-1",
  status: "pending",
};

test("only the assigned provider can confirm a logistics request", () => {
  assert.equal(
    transitionLogisticsRequest(
      request,
      { id: "provider-2", role: "provider" },
      "accept",
    ).changed,
    false,
  );
  assert.deepEqual(
    transitionLogisticsRequest(
      request,
      { id: "provider-1", role: "provider" },
      "accept",
    ),
    { status: "accepted", changed: true },
  );
});

test("provider can request more information and farmer can resubmit", () => {
  const moreInfo = transitionLogisticsRequest(
    request,
    { id: "provider-1", role: "provider" },
    "request_information",
  );
  assert.equal(moreInfo.status, "more_information");
  assert.equal(
    transitionLogisticsRequest(
      { ...request, status: "more_information" },
      { id: "farmer-1", role: "farmer" },
      "resubmit",
    ).status,
    "pending",
  );
});

test("logistics request is not confirmed by submission and can be cancelled by its farmer", () => {
  assert.equal(request.status, "pending");
  assert.equal(
    transitionLogisticsRequest(request, { id: "farmer-1", role: "farmer" }, "cancel").status,
    "cancelled",
  );
});
