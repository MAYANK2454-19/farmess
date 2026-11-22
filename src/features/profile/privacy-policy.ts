import { isFarmessRole, type FarmessRole } from "../../lib/auth/authorization.ts";

export const FARMER_DATA_CATEGORIES = [
  "approximate_location",
  "exact_location",
  "contact_details",
] as const;

export type FarmerDataCategory = (typeof FARMER_DATA_CATEGORIES)[number];

export const DISCLOSURE_WORKFLOWS = [
  "market_matching",
  "accepted_offer",
  "assigned_logistics",
] as const;

export type DisclosureWorkflow = (typeof DISCLOSURE_WORKFLOWS)[number];

export type FarmerPrivacyConsents = {
  approximateLocationSharing: boolean;
  exactLocationDisclosure: boolean;
  buyerContactDisclosure: boolean;
  providerContactDisclosure: boolean;
};

export const DEFAULT_FARMER_PRIVACY_CONSENTS: FarmerPrivacyConsents = {
  approximateLocationSharing: false,
  exactLocationDisclosure: false,
  buyerContactDisclosure: false,
  providerContactDisclosure: false,
};

export type FarmerDisclosureRequest = {
  viewerId: string | null | undefined;
  viewerRole: FarmessRole | null | undefined;
  farmerId: string | null | undefined;
  dataCategory: FarmerDataCategory;
  workflow: DisclosureWorkflow;
  consent: FarmerPrivacyConsents | null | undefined;
};

export type FarmerDisclosureDecision =
  | {
      allowed: true;
      reason: "self_access" | "consented_workflow";
    }
  | {
      allowed: false;
      reason:
        | "invalid_request"
        | "workflow_not_authorized"
        | "consent_required"
        | "role_not_authorized";
    };

function hasUsableId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isDataCategory(value: unknown): value is FarmerDataCategory {
  return (
    typeof value === "string" &&
    FARMER_DATA_CATEGORIES.includes(value as FarmerDataCategory)
  );
}

function isDisclosureWorkflow(value: unknown): value is DisclosureWorkflow {
  return (
    typeof value === "string" &&
    DISCLOSURE_WORKFLOWS.includes(value as DisclosureWorkflow)
  );
}

function readConsents(
  value: FarmerPrivacyConsents | null | undefined,
): FarmerPrivacyConsents | null {
  if (value === null || value === undefined) {
    return { ...DEFAULT_FARMER_PRIVACY_CONSENTS };
  }

  if (typeof value !== "object" || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const fields = [
    "approximateLocationSharing",
    "exactLocationDisclosure",
    "buyerContactDisclosure",
    "providerContactDisclosure",
  ] as const;

  if (!fields.every((field) => typeof record[field] === "boolean")) return null;

  return {
    approximateLocationSharing: record.approximateLocationSharing as boolean,
    exactLocationDisclosure: record.exactLocationDisclosure as boolean,
    buyerContactDisclosure: record.buyerContactDisclosure as boolean,
    providerContactDisclosure: record.providerContactDisclosure as boolean,
  };
}

function isPermittedWorkflow(
  role: FarmessRole,
  dataCategory: FarmerDataCategory,
  workflow: DisclosureWorkflow,
): boolean {
  switch (dataCategory) {
    case "approximate_location":
      return (
        (role === "buyer" && workflow === "market_matching") ||
        (role === "operator" && workflow === "assigned_logistics")
      );

    case "contact_details":
      return (
        (role === "buyer" && workflow === "accepted_offer") ||
        (role === "operator" && workflow === "assigned_logistics")
      );

    case "exact_location":
      return (
        (role === "buyer" && workflow === "accepted_offer") ||
        (role === "operator" && workflow === "assigned_logistics")
      );

    default:
      return false;
  }
}

function hasRequiredConsent(
  dataCategory: FarmerDataCategory,
  role: FarmessRole,
  consents: FarmerPrivacyConsents,
): boolean {
  switch (dataCategory) {
    case "approximate_location":
      return consents.approximateLocationSharing;

    case "contact_details":
      return role === "buyer"
        ? consents.buyerContactDisclosure
        : role === "operator" && consents.providerContactDisclosure;

    case "exact_location":
      return consents.exactLocationDisclosure;

    default:
      return false;
  }
}

/**
 * Evaluate a narrowly-scoped disclosure of farmer data.
 *
 * Use consent settings read from the farmer's persisted profile and workflow
 * state read from the server/database. Never accept these values from the
 * viewer's request body or treat a notification/link as workflow evidence.
 */
export function evaluateFarmerDataDisclosure(
  request: FarmerDisclosureRequest,
): FarmerDisclosureDecision {
  if (
    !hasUsableId(request.viewerId) ||
    !hasUsableId(request.farmerId) ||
    !isFarmessRole(request.viewerRole) ||
    !isDataCategory(request.dataCategory) ||
    !isDisclosureWorkflow(request.workflow)
  ) {
    return { allowed: false, reason: "invalid_request" };
  }

  if (request.viewerId === request.farmerId) {
    return { allowed: true, reason: "self_access" };
  }

  const consents = readConsents(request.consent);
  if (!consents) {
    return { allowed: false, reason: "invalid_request" };
  }

  if (!isPermittedWorkflow(request.viewerRole, request.dataCategory, request.workflow)) {
    return { allowed: false, reason: "workflow_not_authorized" };
  }

  if (!hasRequiredConsent(request.dataCategory, request.viewerRole, consents)) {
    return { allowed: false, reason: "consent_required" };
  }

  return { allowed: true, reason: "consented_workflow" };
}
