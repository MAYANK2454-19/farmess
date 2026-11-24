export type ProviderRequestCancellationResult =
  { valid: true; id: string } | { valid: false; error: string };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseProviderRequestCancellation(
  input: unknown,
): ProviderRequestCancellationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { valid: false, error: "Send a valid provider cancellation request." };
  }

  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).length !== 2 ||
    Object.keys(body).some((key) => key !== "id" && key !== "action") ||
    typeof body.id !== "string" ||
    !UUID_PATTERN.test(body.id) ||
    body.action !== "cancel"
  ) {
    return { valid: false, error: "Choose an accepted request to cancel." };
  }

  return { valid: true, id: body.id };
}
