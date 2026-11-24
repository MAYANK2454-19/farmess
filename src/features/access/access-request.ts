/*
 * Requests for buyer or operator access. Mirrors the role_access_requests
 * table constraints. Admin access can never be requested.
 */

export const REQUESTABLE_ROLES = ["buyer", "operator"] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

export const ACCESS_DECISIONS = ["approved", "rejected"] as const;
export type AccessDecision = (typeof ACCESS_DECISIONS)[number];

export type AccessRequestInput = {
  requested_role: RequestableRole;
  requester_name: string;
  organisation_name: string;
  reason: string;
};

export type AccessReviewInput = {
  id: string;
  decision: AccessDecision;
  review_note: string;
};

type ParseResult<T> = { ok: true; data: T } | { ok: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textWithin(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null;
}

export function parseAccessRequest(body: unknown): ParseResult<AccessRequestInput> {
  if (!isRecord(body)) return { ok: false, error: "Send the access request as JSON." };

  const allowed = new Set(["requested_role", "requester_name", "organisation_name", "reason"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    return { ok: false, error: "The request contains fields that cannot be set." };
  }

  if (!REQUESTABLE_ROLES.includes(body.requested_role as RequestableRole)) {
    return { ok: false, error: "Choose buyer or transport & storage operator access." };
  }

  const requesterName = textWithin(body.requester_name, 2, 80);
  if (!requesterName) return { ok: false, error: "Enter your name (2–80 characters)." };

  const organisationName = textWithin(body.organisation_name, 2, 120);
  if (!organisationName) {
    return { ok: false, error: "Enter your organisation or business name (2–120 characters)." };
  }

  const reason = textWithin(body.reason, 20, 500);
  if (!reason) {
    return {
      ok: false,
      error: "Describe your business and why you need access (20–500 characters).",
    };
  }

  return {
    ok: true,
    data: {
      requested_role: body.requested_role as RequestableRole,
      requester_name: requesterName,
      organisation_name: organisationName,
      reason,
    },
  };
}

export function parseAccessReview(body: unknown): ParseResult<AccessReviewInput> {
  if (!isRecord(body)) return { ok: false, error: "Send the review decision as JSON." };

  if (typeof body.id !== "string" || !UUID_PATTERN.test(body.id)) {
    return { ok: false, error: "Choose a valid access request." };
  }
  if (!ACCESS_DECISIONS.includes(body.decision as AccessDecision)) {
    return { ok: false, error: "Choose approve or reject." };
  }
  const note = textWithin(body.review_note, 10, 500);
  if (!note) return { ok: false, error: "Add a review note between 10 and 500 characters." };

  return {
    ok: true,
    data: { id: body.id, decision: body.decision as AccessDecision, review_note: note },
  };
}
