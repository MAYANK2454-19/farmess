export type OperatorListingUpdate = {
  capacity_quantity: number | null;
  capacity_unit: "kg" | "quintal" | "tonne" | null;
  available_from: string | null;
  available_until: string | null;
};

export type OperatorListingUpdateResult =
  | { valid: true; value: OperatorListingUpdate }
  | { valid: false; error: string };

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseOperatorListingUpdate(
  input: unknown,
): OperatorListingUpdateResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { valid: false, error: "Send valid listing availability and capacity details." };
  }

  const body = input as Record<string, unknown>;
  const allowed = [
    "id",
    "capacity_quantity",
    "capacity_unit",
    "available_from",
    "available_until",
  ];
  if (
    Object.keys(body).length !== allowed.length ||
    Object.keys(body).some((key) => !allowed.includes(key)) ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)
  ) {
    return { valid: false, error: "Choose a valid listing and only editable fields." };
  }

  const quantity = body.capacity_quantity;
  const unit = body.capacity_unit;
  if (
    quantity !== null &&
    (typeof quantity !== "number" ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      quantity > Number.MAX_SAFE_INTEGER)
  ) {
    return { valid: false, error: "Capacity must be a finite positive quantity or left blank." };
  }
  if (
    (quantity === null) !== (unit === null) ||
    (unit !== null && unit !== "kg" && unit !== "quintal" && unit !== "tonne")
  ) {
    return { valid: false, error: "Select both a capacity and its unit, or clear both." };
  }

  const availableFrom = body.available_from;
  const availableUntil = body.available_until;
  if (availableFrom !== null && !isCalendarDate(availableFrom)) {
    return { valid: false, error: "Enter a valid availability start date or leave it blank." };
  }
  if (availableUntil !== null && !isCalendarDate(availableUntil)) {
    return { valid: false, error: "Enter a valid availability end date or leave it blank." };
  }
  if (
    typeof availableFrom === "string" &&
    typeof availableUntil === "string" &&
    availableUntil < availableFrom
  ) {
    return { valid: false, error: "Availability end date must not precede its start date." };
  }

  return {
    valid: true,
    value: {
      capacity_quantity: quantity as number | null,
      capacity_unit: unit as "kg" | "quintal" | "tonne" | null,
      available_from: availableFrom as string | null,
      available_until: availableUntil as string | null,
    },
  };
}
