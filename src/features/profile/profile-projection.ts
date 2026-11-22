import {
  DISCLOSURE_WORKFLOWS,
  evaluateFarmerDataDisclosure,
  type DisclosureWorkflow,
  type FarmerDisclosureDecision,
  type FarmerPrivacyConsents,
} from "./privacy-policy.ts";
import { isFarmessRole, type FarmessRole } from "../../lib/auth/authorization.ts";

export type ExactLocationValue = {
  latitude: number;
  longitude: number;
};

export type FarmerProfileProjectionView = {
  displayName: string;
  approximateLocation: string | null;
  contactDetails: {
    phoneNumber: string;
  } | null;
  exactLocation: ExactLocationValue | null;
};

export type FarmerProfileProjectionDecisions = {
  approximateLocation: FarmerDisclosureDecision;
  contactDetails: FarmerDisclosureDecision;
  exactLocation: FarmerDisclosureDecision;
};

export type FarmerProfileProjectionResult =
  | {
      status: "valid";
      view: FarmerProfileProjectionView;
      decisions: FarmerProfileProjectionDecisions;
    }
  | {
      status: "invalid";
      view: null;
      decisions: null;
      reason:
        | "invalid_identity"
        | "invalid_workflow"
        | "invalid_profile"
        | "invalid_profile_field"
        | "invalid_exact_location";
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUsableId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isWorkflow(value: unknown): value is DisclosureWorkflow {
  return (
    typeof value === "string" &&
    DISCLOSURE_WORKFLOWS.includes(value as DisclosureWorkflow)
  );
}

function parseOptionalText(
  value: unknown,
): { valid: true; value: string | null } | { valid: false } {
  if (value === undefined || value === null) return { valid: true, value: null };
  if (typeof value !== "string") return { valid: false };

  const trimmed = value.trim();
  return { valid: true, value: trimmed || null };
}

function parseExactLocation(
  value: unknown,
): { valid: true; value: ExactLocationValue | null } | { valid: false } {
  if (value === undefined || value === null) return { valid: true, value: null };
  if (!isRecord(value)) return { valid: false };

  const latitude = value.latitude;
  const longitude = value.longitude;

  if (
    typeof latitude !== "number" ||
    typeof longitude !== "number" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { valid: false };
  }

  return {
    valid: true,
    value: { latitude, longitude },
  };
}

/**
 * Build a minimal farmer profile response using the persisted consent state
 * and server-verified viewer/workflow context.
 *
 * The raw profile is never returned. Contact and exact-location fields are
 * projected only after a purpose-specific disclosure decision succeeds.
 */
export function buildFarmerProfileProjection(input: {
  viewerId: string | null | undefined;
  viewerRole: FarmessRole | null | undefined;
  workflow: DisclosureWorkflow;
  profile: unknown;
}): FarmerProfileProjectionResult {
  if (!hasUsableId(input.viewerId) || !isFarmessRole(input.viewerRole)) {
    return {
      status: "invalid",
      view: null,
      decisions: null,
      reason: "invalid_identity",
    };
  }

  if (!isWorkflow(input.workflow)) {
    return {
      status: "invalid",
      view: null,
      decisions: null,
      reason: "invalid_workflow",
    };
  }

  if (!isRecord(input.profile)) {
    return {
      status: "invalid",
      view: null,
      decisions: null,
      reason: "invalid_profile",
    };
  }

  const farmerId = input.profile.userId;
  const displayName = input.profile.displayName;

  if (!hasUsableId(farmerId) || typeof displayName !== "string" || !displayName.trim()) {
    return {
      status: "invalid",
      view: null,
      decisions: null,
      reason: "invalid_profile_field",
    };
  }

  const approximateLocation = parseOptionalText(input.profile.marketArea);
  const phoneNumber = parseOptionalText(input.profile.phoneNumber);
  const exactLocation = parseExactLocation(input.profile.exactLocation);

  if (!approximateLocation.valid || !phoneNumber.valid) {
    return {
      status: "invalid",
      view: null,
      decisions: null,
      reason: "invalid_profile_field",
    };
  }

  if (!exactLocation.valid) {
    return {
      status: "invalid",
      view: null,
      decisions: null,
      reason: "invalid_exact_location",
    };
  }

  const consent = (input.profile.consents ?? null) as FarmerPrivacyConsents | null;

  const evaluate = (
    dataCategory: "approximate_location" | "contact_details" | "exact_location",
  ): FarmerDisclosureDecision =>
    evaluateFarmerDataDisclosure({
      viewerId: input.viewerId,
      viewerRole: input.viewerRole,
      farmerId,
      dataCategory,
      workflow: input.workflow,
      consent,
    });

  const decisions: FarmerProfileProjectionDecisions = {
    approximateLocation: evaluate("approximate_location"),
    contactDetails: evaluate("contact_details"),
    exactLocation: evaluate("exact_location"),
  };

  return {
    status: "valid",
    view: {
      displayName: displayName.trim(),
      approximateLocation: decisions.approximateLocation.allowed
        ? approximateLocation.value
        : null,
      contactDetails:
        decisions.contactDetails.allowed && phoneNumber.value
          ? { phoneNumber: phoneNumber.value }
          : null,
      exactLocation: decisions.exactLocation.allowed ? exactLocation.value : null,
    },
    decisions,
  };
}
