export type SaleActivityUnit = "kg" | "quintal" | "tonne";

type SaleActivityEventBase = {
  id: string;
  saleId: string;
  lotId: string;
  actorId: string;
  occurredAt: string;
  createdAt: string;
  eventStatus: "recorded" | "disputed";
  evidenceReference?: string | null;
};

export type SaleActivityEvent =
  | (SaleActivityEventBase & { eventType: "offer_accepted" })
  | (SaleActivityEventBase & { eventType: "agreed_terms_recorded" })
  | (SaleActivityEventBase & { eventType: "dispatch_recorded" })
  | (SaleActivityEventBase & {
      eventType: "weighment_recorded";
      quantity: number;
      unit: SaleActivityUnit;
    })
  | (SaleActivityEventBase & { eventType: "delivery_recorded" })
  | (SaleActivityEventBase & {
      eventType: "payment_status_reported";
      reportedStatus: "unpaid" | "partial" | "paid" | "unknown";
    });

export type SaleTimelineEntry = {
  event: SaleActivityEvent;
  label: string;
  paymentVerification: "not_applicable" | "externally_reported";
};

/**
 * Validate an append-only sale event before persistence.
 * Authentication, sale ownership and evidence access must be checked by the
 * trusted server/database layer; this helper is not an authorization boundary.
 */
export function validateSaleActivityEvent(event: SaleActivityEvent): string[] {
  const errors: string[] = [];

  for (const [field, value] of [
    ["id", event.id],
    ["saleId", event.saleId],
    ["lotId", event.lotId],
    ["actorId", event.actorId],
  ] as const) {
    if (!value.trim()) {
      errors.push(`${field} is required.`);
    }
  }

  if (!Number.isFinite(Date.parse(event.occurredAt))) {
    errors.push("Event occurrence time must be a valid date/time.");
  }
  if (!Number.isFinite(Date.parse(event.createdAt))) {
    errors.push("Event creation time must be a valid date/time.");
  }
  if (event.evidenceReference != null && !event.evidenceReference.trim()) {
    errors.push("Evidence reference must be omitted or non-empty.");
  }

  if (event.eventType === "weighment_recorded") {
    const factors: Record<SaleActivityUnit, number> = {
      kg: 1,
      quintal: 100,
      tonne: 1000,
    };
    if (
      !Number.isFinite(event.quantity) ||
      event.quantity <= 0 ||
      !(event.unit in factors) ||
      !Number.isFinite(event.quantity * factors[event.unit])
    ) {
      errors.push("Weighment must have a valid positive quantity and unit.");
    }
  }

  return errors;
}

function describeEvent(event: SaleActivityEvent): SaleTimelineEntry {
  const labels: Record<
    Exclude<SaleActivityEvent["eventType"], "weighment_recorded" | "payment_status_reported">,
    string
  > = {
    offer_accepted: "Offer accepted",
    agreed_terms_recorded: "Agreed terms recorded",
    dispatch_recorded: "Dispatch recorded",
    delivery_recorded: "Delivery recorded",
  };

  let label: string;
  let paymentVerification: SaleTimelineEntry["paymentVerification"] = "not_applicable";

  if (event.eventType === "weighment_recorded") {
    label = `Weighment recorded: ${event.quantity} ${event.unit}`;
  } else if (event.eventType === "payment_status_reported") {
    label =
      `Payment status reported: ${event.reportedStatus}. ` +
      "Not verified or processed by Farmess.";
    paymentVerification = "externally_reported";
  } else {
    label = labels[event.eventType];
  }

  if (event.eventStatus === "disputed") {
    label = `Disputed — ${label}`;
  }

  return { event, label, paymentVerification };
}

/**
 * Build a chronological timeline for one sale. Events for other sales are
 * excluded. The caller must authorize access to the sale before calling this.
 */
export function buildSaleTimeline(
  saleId: string,
  events: SaleActivityEvent[],
): SaleTimelineEntry[] {
  if (!saleId.trim()) {
    throw new Error("A sale ID is required to build its activity timeline.");
  }

  return events
    .filter((event) => event.saleId === saleId)
    .map((event) => {
      const errors = validateSaleActivityEvent(event);
      if (errors.length > 0) {
        throw new Error(`Invalid sale activity event ${event.id}: ${errors.join(" ")}`);
      }
      return describeEvent(event);
    })
    .sort((a, b) => {
      const occurredDifference = Date.parse(a.event.occurredAt) - Date.parse(b.event.occurredAt);
      if (occurredDifference !== 0) {
        return occurredDifference;
      }
      const createdDifference = Date.parse(a.event.createdAt) - Date.parse(b.event.createdAt);
      if (createdDifference !== 0) {
        return createdDifference;
      }
      return a.event.id.localeCompare(b.event.id);
    });
}
