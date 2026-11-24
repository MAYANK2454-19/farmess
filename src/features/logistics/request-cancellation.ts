export type ServiceRequestCancellation =
  | { valid: true; id: string }
  | { valid: false; error: string };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseServiceRequestCancellation(
  input: unknown,
): ServiceRequestCancellation {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.keys(input).length !== 2
  ) {
    return { valid: false, error: "Send a valid service request cancellation." };
  }

  const body = input as Record<string, unknown>;
  if (
    Object.keys(body).some((key) => key !== "id" && key !== "action") ||
    body.action !== "cancel" ||
    typeof body.id !== "string" ||
    !UUID_PATTERN.test(body.id)
  ) {
    return { valid: false, error: "Choose a valid service request to cancel." };
  }

  return { valid: true, id: body.id };
}
