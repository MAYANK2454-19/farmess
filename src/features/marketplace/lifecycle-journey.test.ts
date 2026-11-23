import assert from "node:assert/strict";
import test from "node:test";
import {
  transitionLogisticsRequest,
  transitionOffer,
  type LogisticsRequestForTransition,
  type OfferForTransition,
} from "./domain.ts";
import { createNotificationDraft } from "./notifications.ts";
import { buildSaleTimeline, type SaleActivityEvent } from "./sale-activity.ts";

const fixedNow = new Date("2026-11-22T10:00:00.000Z");

const offer: OfferForTransition = {
  id: "offer-journey-1",
  buyerId: "buyer-1",
  farmerId: "farmer-1",
  validUntil: "2026-11-23T10:00:00.000Z",
  status: "pending",
};

const logisticsRequest: LogisticsRequestForTransition = {
  id: "logistics-journey-1",
  farmerId: "farmer-1",
  providerId: "provider-1",
  status: "pending",
};

test(
  "buyer-to-farmer sale journey records an accepted offer and truthful sale timeline",
  () => {
  const unrelatedFarmer = transitionOffer(
    offer,
    { id: "farmer-2", role: "farmer" },
    "accept",
    fixedNow,
  );
  assert.deepEqual(unrelatedFarmer, {
    status: "pending",
    changed: false,
    reason: "Only the lot-owning farmer can respond.",
  });

  const accepted = transitionOffer(
    offer,
    { id: "farmer-1", role: "farmer" },
    "accept",
    fixedNow,
  );
  assert.deepEqual(accepted, { status: "accepted", changed: true });

  const buyerNotification = createNotificationDraft({
    recipientUserId: "farmer-1",
    eventType: "offer_accepted",
    title: "Offer accepted",
    body: "The farmer accepted the buyer offer for this lot.",
    relatedEntityType: "offer",
    relatedEntityId: offer.id,
    eventVersion: "accepted-v1",
  });
  assert.equal(buyerNotification.recipientUserId, "farmer-1");
  assert.equal(buyerNotification.relatedEntityId, offer.id);

  const events: SaleActivityEvent[] = [
    {
      id: "event-payment",
      saleId: "sale-1",
      lotId: "lot-1",
      actorId: "farmer-1",
      occurredAt: "2026-11-22T09:00:00.000Z",
      createdAt: "2026-11-22T09:01:00.000Z",
      eventStatus: "recorded",
      eventType: "payment_status_reported",
      reportedStatus: "paid",
    },
    {
      id: "event-offer",
      saleId: "sale-1",
      lotId: "lot-1",
      actorId: "farmer-1",
      occurredAt: "2026-11-22T08:00:00.000Z",
      createdAt: "2026-11-22T08:01:00.000Z",
      eventStatus: "recorded",
      eventType: "offer_accepted",
    },
    {
      id: "event-other-sale",
      saleId: "sale-2",
      lotId: "lot-2",
      actorId: "farmer-1",
      occurredAt: "2026-11-22T07:00:00.000Z",
      createdAt: "2026-11-22T07:01:00.000Z",
      eventStatus: "recorded",
      eventType: "delivery_recorded",
    },
    {
      id: "event-weighment",
      saleId: "sale-1",
      lotId: "lot-1",
      actorId: "provider-1",
      occurredAt: "2026-11-22T08:30:00.000Z",
      createdAt: "2026-11-22T08:31:00.000Z",
      eventStatus: "disputed",
      eventType: "weighment_recorded",
      quantity: 175,
      unit: "kg",
    },
  ];

  const timeline = buildSaleTimeline("sale-1", events);
  assert.deepEqual(
    timeline.map((entry) => entry.event.id),
    ["event-offer", "event-weighment", "event-payment"],
  );
  assert.match(timeline[1].label, /^Disputed/);
  assert.match(timeline[2].label, /Not verified or processed by Farmess/);
  assert.equal(timeline[2].paymentVerification, "externally_reported");
  },
);

test(
  "logistics journey requires the assigned provider and preserves pending until response",
  () => {
  assert.equal(logisticsRequest.status, "pending");

  const unrelatedProvider = transitionLogisticsRequest(
    logisticsRequest,
    { id: "provider-2", role: "provider" },
    "accept",
  );
  assert.equal(unrelatedProvider.changed, false);
  assert.equal(unrelatedProvider.status, "pending");

  const requestedInformation = transitionLogisticsRequest(
    logisticsRequest,
    { id: "provider-1", role: "provider" },
    "request_information",
  );
  assert.deepEqual(requestedInformation, { status: "more_information", changed: true });

  const unrelatedFarmerResubmit = transitionLogisticsRequest(
    { ...logisticsRequest, status: "more_information" },
    { id: "farmer-2", role: "farmer" },
    "resubmit",
  );
  assert.equal(unrelatedFarmerResubmit.changed, false);

  const resubmitted = transitionLogisticsRequest(
    { ...logisticsRequest, status: "more_information" },
    { id: "farmer-1", role: "farmer" },
    "resubmit",
  );
  assert.deepEqual(resubmitted, { status: "pending", changed: true });

  const accepted = transitionLogisticsRequest(
    { ...logisticsRequest, status: resubmitted.status },
    { id: "provider-1", role: "provider" },
    "accept",
  );
  assert.deepEqual(accepted, { status: "accepted", changed: true });

  const farmerNotification = createNotificationDraft({
    recipientUserId: "farmer-1",
    eventType: "logistics_provider_responded",
    title: "Transport request updated",
    body: "The assigned transport provider accepted the request.",
    relatedEntityType: "logistics_request",
    relatedEntityId: logisticsRequest.id,
    eventVersion: "accepted-v1",
  });
  assert.equal(farmerNotification.recipientUserId, logisticsRequest.farmerId);
  },
);

test(
  "expired offers cannot be accepted and terminal logistics requests cannot be cancelled",
  () => {
  const expired = transitionOffer(
    { ...offer, validUntil: "2026-11-21T10:00:00.000Z" },
    { id: "farmer-1", role: "farmer" },
    "accept",
    fixedNow,
  );
  assert.equal(expired.status, "expired");
  assert.equal(expired.changed, true);

  const cancelled = transitionLogisticsRequest(
    { ...logisticsRequest, status: "declined" },
    { id: "farmer-1", role: "farmer" },
    "cancel",
  );
  assert.equal(cancelled.status, "declined");
  assert.equal(cancelled.changed, false);
});
