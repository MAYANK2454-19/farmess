import {
  createNotificationDraft,
  NOTIFICATION_EVENT_TYPES,
  type NotificationDraft,
  type NotificationEventType,
} from "../marketplace/notifications.ts";

export type NotificationDeliveryActor =
  | { kind: "user"; userId: string }
  | { kind: "system" };

export type NotificationDeliveryRelationship =
  | {
      kind: "offer";
      relatedEntityId: string;
      farmerId: string;
      buyerId: string;
    }
  | {
      kind: "logistics_request";
      relatedEntityId: string;
      farmerId: string;
      assignedProviderId: string;
    }
  | {
      kind: "sale";
      relatedEntityId: string;
      participantUserIds: readonly string[];
    };

export type NotificationDeliveryPlan = {
  status: "valid";
  drafts: NotificationDraft[];
  recipientCount: number;
  skippedReason: "no_other_recipients" | null;
};

export type NotificationDeliveryPlanError =
  | "invalid_event"
  | "invalid_actor"
  | "invalid_relationship"
  | "entity_mismatch"
  | "actor_not_authorized"
  | "invalid_notification_draft";

export type NotificationDeliveryPlanResult =
  | NotificationDeliveryPlan
  | {
      status: "invalid";
      drafts: [];
      recipientCount: 0;
      reason: NotificationDeliveryPlanError;
    };

type UnknownRecord = Record<string, unknown>;

type ParsedEvent = {
  eventType: NotificationEventType;
  relatedEntityId: string;
  eventVersion: string;
};

type ParsedRelationship =
  | {
      kind: "offer";
      relatedEntityId: string;
      farmerId: string;
      buyerId: string;
    }
  | {
      kind: "logistics_request";
      relatedEntityId: string;
      farmerId: string;
      assignedProviderId: string;
    }
  | {
      kind: "sale";
      relatedEntityId: string;
      participantUserIds: string[];
    };

type Message = {
  title: string;
  body: string;
};

const MAX_ID_LENGTH = 128;
const MAX_EVENT_VERSION_LENGTH = 128;

const MESSAGES: Record<NotificationEventType, Message> = {
  new_offer: {
    title: "New offer received",
    body: "A buyer submitted an offer for your produce lot.",
  },
  offer_accepted: {
    title: "Offer accepted",
    body: "Your offer has been accepted. Review the next steps.",
  },
  offer_declined: {
    title: "Offer declined",
    body: "Your offer was declined. You can review other available lots.",
  },
  offer_withdrawn: {
    title: "Offer withdrawn",
    body: "A buyer withdrew an offer for your produce lot.",
  },
  offer_expired: {
    title: "Offer expired",
    body: "An offer for this produce lot has expired.",
  },
  logistics_request_received: {
    title: "New logistics request",
    body: "A farmer has submitted a logistics request for your review.",
  },
  logistics_provider_responded: {
    title: "Logistics provider responded",
    body: "The assigned provider has updated the logistics request.",
  },
  sale_milestone_recorded: {
    title: "Sale activity updated",
    body: "A new milestone has been recorded for this sale.",
  },
};

const OFFER_EVENT_TYPES: readonly NotificationEventType[] = [
  "new_offer",
  "offer_accepted",
  "offer_declined",
  "offer_withdrawn",
  "offer_expired",
];

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_ID_LENGTH ? normalized : null;
}

function parseEvent(value: unknown): ParsedEvent | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.eventType !== "string" ||
    !NOTIFICATION_EVENT_TYPES.includes(value.eventType as NotificationEventType)
  ) {
    return null;
  }

  const relatedEntityId = parseId(value.relatedEntityId);
  const eventVersion = parseId(value.eventVersion);

  if (!relatedEntityId || !eventVersion || eventVersion.length > MAX_EVENT_VERSION_LENGTH) {
    return null;
  }

  return {
    eventType: value.eventType as NotificationEventType,
    relatedEntityId,
    eventVersion,
  };
}

function parseActor(value: unknown): NotificationDeliveryActor | null {
  if (!isRecord(value)) return null;

  if (value.kind === "system") {
    return { kind: "system" };
  }

  if (value.kind !== "user") return null;
  const userId = parseId(value.userId);
  return userId ? { kind: "user", userId } : null;
}

function parseRelationship(value: unknown): ParsedRelationship | null {
  if (!isRecord(value)) return null;

  const relatedEntityId = parseId(value.relatedEntityId);
  if (!relatedEntityId) return null;

  if (value.kind === "offer") {
    const farmerId = parseId(value.farmerId);
    const buyerId = parseId(value.buyerId);

    if (!farmerId || !buyerId || farmerId === buyerId) return null;

    return { kind: "offer", relatedEntityId, farmerId, buyerId };
  }

  if (value.kind === "logistics_request") {
    const farmerId = parseId(value.farmerId);
    const assignedProviderId = parseId(value.assignedProviderId);

    if (!farmerId || !assignedProviderId || farmerId === assignedProviderId) return null;

    return {
      kind: "logistics_request",
      relatedEntityId,
      farmerId,
      assignedProviderId,
    };
  }

  if (value.kind === "sale") {
    if (!Array.isArray(value.participantUserIds) || value.participantUserIds.length === 0) {
      return null;
    }

    const participantUserIds: string[] = [];

    for (const candidate of value.participantUserIds) {
      const participantId = parseId(candidate);
      if (!participantId) return null;
      if (!participantUserIds.includes(participantId)) {
        participantUserIds.push(participantId);
      }
    }

    return { kind: "sale", relatedEntityId, participantUserIds };
  }

  return null;
}

function expectedRelationshipKind(eventType: NotificationEventType): ParsedRelationship["kind"] {
  if (OFFER_EVENT_TYPES.includes(eventType)) return "offer";
  if (
    eventType === "logistics_request_received" ||
    eventType === "logistics_provider_responded"
  ) {
    return "logistics_request";
  }
  return "sale";
}

function isUserActor(
  actor: NotificationDeliveryActor,
  expectedUserId: string,
): boolean {
  return actor.kind === "user" && actor.userId === expectedUserId;
}

function selectRecipients(
  eventType: NotificationEventType,
  actor: NotificationDeliveryActor,
  relationship: ParsedRelationship,
): string[] | null {
  switch (eventType) {
    case "new_offer":
      if (relationship.kind !== "offer" || !isUserActor(actor, relationship.buyerId)) {
        return null;
      }
      return [relationship.farmerId];

    case "offer_accepted":
    case "offer_declined":
      if (relationship.kind !== "offer" || !isUserActor(actor, relationship.farmerId)) {
        return null;
      }
      return [relationship.buyerId];

    case "offer_withdrawn":
      if (relationship.kind !== "offer" || !isUserActor(actor, relationship.buyerId)) {
        return null;
      }
      return [relationship.farmerId];

    case "offer_expired":
      if (relationship.kind !== "offer" || actor.kind !== "system") {
        return null;
      }
      return [relationship.farmerId, relationship.buyerId];

    case "logistics_request_received":
      if (
        relationship.kind !== "logistics_request" ||
        !isUserActor(actor, relationship.farmerId)
      ) {
        return null;
      }
      return [relationship.assignedProviderId];

    case "logistics_provider_responded":
      if (
        relationship.kind !== "logistics_request" ||
        !isUserActor(actor, relationship.assignedProviderId)
      ) {
        return null;
      }
      return [relationship.farmerId];

    case "sale_milestone_recorded":
      if (
        relationship.kind !== "sale" ||
        actor.kind !== "user" ||
        !relationship.participantUserIds.includes(actor.userId)
      ) {
        return null;
      }
      return relationship.participantUserIds.filter((id) => id !== actor.userId);

    default:
      return null;
  }
}

/**
 * Plan inbox deliveries from a persisted event and a trusted relationship
 * snapshot. The caller must load relationship IDs from the database and actor
 * identity from the verified session (or use a system actor for expiry jobs).
 *
 * The planner excludes the actor, emits generic notification copy and builds
 * one recipient-scoped idempotency key per selected recipient.
 */
export function planNotificationDeliveries(input: unknown): NotificationDeliveryPlanResult {
  if (!isRecord(input)) {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "invalid_event",
    };
  }

  const event = parseEvent(input.event);
  if (!event) {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "invalid_event",
    };
  }

  const actor = parseActor(input.actor);
  if (!actor) {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "invalid_actor",
    };
  }

  const relationship = parseRelationship(input.relationship);
  if (!relationship) {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "invalid_relationship",
    };
  }

  if (
    relationship.kind !== expectedRelationshipKind(event.eventType) ||
    relationship.relatedEntityId !== event.relatedEntityId
  ) {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "entity_mismatch",
    };
  }

  const recipientIds = selectRecipients(event.eventType, actor, relationship);
  if (!recipientIds) {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "actor_not_authorized",
    };
  }

  const uniqueRecipients = [...new Set(recipientIds)]
    .filter((recipientId) => actor.kind !== "user" || recipientId !== actor.userId)
    .sort((left, right) => left.localeCompare(right));

  const message = MESSAGES[event.eventType];

  try {
    const drafts = uniqueRecipients.map((recipientUserId) =>
      createNotificationDraft({
        recipientUserId,
        eventType: event.eventType,
        title: message.title,
        body: message.body,
        relatedEntityType: relationship.kind,
        relatedEntityId: relationship.relatedEntityId,
        eventVersion: event.eventVersion,
      }),
    );

    return {
      status: "valid",
      drafts,
      recipientCount: drafts.length,
      skippedReason: drafts.length === 0 ? "no_other_recipients" : null,
    };
  } catch {
    return {
      status: "invalid",
      drafts: [],
      recipientCount: 0,
      reason: "invalid_notification_draft",
    };
  }
}
