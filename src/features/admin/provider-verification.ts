export const PROVIDER_VERIFICATION_STATES = [
  "unverified",
  "contact_verified",
  "document_verified",
  "platform_verified",
  "suspended",
] as const;

export type ProviderVerificationState = (typeof PROVIDER_VERIFICATION_STATES)[number];

export type ProviderVerificationReview = {
  id: string;
  verificationState: ProviderVerificationState;
  reviewNote: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Validate and normalize the complete admin review payload before it reaches the database RPC. */
export function parseProviderVerificationReview(value: unknown): ProviderVerificationReview | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (key) => key !== "id" && key !== "verification_state" && key !== "review_note",
    ) ||
    typeof value.id !== "string" ||
    !UUID_PATTERN.test(value.id) ||
    typeof value.verification_state !== "string" ||
    !PROVIDER_VERIFICATION_STATES.includes(value.verification_state as ProviderVerificationState) ||
    typeof value.review_note !== "string"
  ) {
    return null;
  }

  const reviewNote = value.review_note.trim();
  if (reviewNote.length < 20 || reviewNote.length > 500) return null;

  return {
    id: value.id,
    verificationState: value.verification_state as ProviderVerificationState,
    reviewNote,
  };
}
