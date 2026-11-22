import {
  canAccessOwnedResource,
  canReadParticipatingSale,
  canRevealPrivateFarmerDetails,
  hasPermission,
  isFarmessRole,
  type FarmessPermission,
  type FarmessRole,
} from "./authorization.ts";

export type FarmessActor = {
  userId: string;
  role: FarmessRole;
};

export type ResourceAuthorizationRule =
  | {
      kind: "owned";
      ownerId: string;
    }
  | {
      kind: "assigned";
      assigneeId: string;
    }
  | {
      kind: "participant";
      participantUserIds: readonly string[];
    }
  | {
      kind: "farmer_details";
      farmerId: string;
      farmerConsented: boolean;
      workflowAuthorized: boolean;
    };

export type AuthorizationFailureReason =
  | "unauthenticated"
  | "invalid_actor"
  | "permission_denied"
  | "invalid_resource_rule"
  | "not_owner"
  | "not_assigned"
  | "not_participant"
  | "farmer_details_private";

export type AuthorizationDecision =
  | {
      allowed: true;
      actor: FarmessActor;
    }
  | {
      allowed: false;
      statusCode: 401 | 403;
      reason: AuthorizationFailureReason;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUsableId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function deny(
  reason: AuthorizationFailureReason,
  statusCode: 401 | 403 = 403,
): AuthorizationDecision {
  return { allowed: false, statusCode, reason };
}

function validateActor(actor: unknown): FarmessActor | null {
  if (!isRecord(actor)) return null;
  if (!hasUsableId(actor.userId) || !isFarmessRole(actor.role)) return null;

  return {
    userId: actor.userId,
    role: actor.role,
  };
}

function authorizeResource(actor: FarmessActor, rule: unknown): AuthorizationFailureReason | null {
  if (!isRecord(rule) || typeof rule.kind !== "string") {
    return "invalid_resource_rule";
  }

  switch (rule.kind) {
    case "owned":
      if (!hasUsableId(rule.ownerId)) return "invalid_resource_rule";
      return canAccessOwnedResource(actor.userId, rule.ownerId) ? null : "not_owner";

    case "assigned":
      if (!hasUsableId(rule.assigneeId)) return "invalid_resource_rule";
      return canAccessOwnedResource(actor.userId, rule.assigneeId) ? null : "not_assigned";

    case "participant":
      if (
        !Array.isArray(rule.participantUserIds) ||
        !rule.participantUserIds.every((id) => typeof id === "string")
      ) {
        return "invalid_resource_rule";
      }
      return canReadParticipatingSale(actor.userId, rule.participantUserIds)
        ? null
        : "not_participant";

    case "farmer_details":
      if (
        !hasUsableId(rule.farmerId) ||
        typeof rule.farmerConsented !== "boolean" ||
        typeof rule.workflowAuthorized !== "boolean"
      ) {
        return "invalid_resource_rule";
      }
      return canRevealPrivateFarmerDetails({
        viewerId: actor.userId,
        viewerRole: actor.role,
        farmerId: rule.farmerId,
        farmerConsented: rule.farmerConsented,
        workflowAuthorized: rule.workflowAuthorized,
      })
        ? null
        : "farmer_details_private";

    default:
      return "invalid_resource_rule";
  }
}

/**
 * Make one server-side authorization decision using the existing Farmess role
 * matrix and a record relationship rule.
 *
 * The actor must come from a verified server-side session. Never build it from
 * request JSON, query parameters, user-editable metadata or client state.
 * Postgres RLS remains authoritative for persisted data access.
 */
export function authorizeFarmessRequest(
  actorInput: FarmessActor | null | undefined,
  permission: FarmessPermission,
  resourceRule?: ResourceAuthorizationRule,
): AuthorizationDecision {
  if (actorInput === null || actorInput === undefined) {
    return deny("unauthenticated", 401);
  }

  const actor = validateActor(actorInput);
  if (!actor) return deny("invalid_actor", 401);

  if (!hasPermission(actor.role, permission)) {
    return deny("permission_denied");
  }

  if (resourceRule !== undefined) {
    const resourceFailure = authorizeResource(actor, resourceRule);
    if (resourceFailure) return deny(resourceFailure);
  }

  return { allowed: true, actor };
}
