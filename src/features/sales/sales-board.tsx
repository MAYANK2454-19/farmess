"use client";

import { useEffect, useState } from "react";
import { ContactCard, type CounterpartyContact } from "@/features/contacts/contact-card";
import { RateForm } from "@/features/ratings/rate-form";
import { RatingBadge } from "@/features/ratings/rating-badge";
import type { RatingSummary } from "@/features/ratings/rating";

type Sale = {
  id: string;
  my_role: "farmer" | "buyer";
  crop: string;
  variety: string | null;
  agreed_quantity: number;
  unit: string;
  agreed_price_paise_per_quintal: number;
  status: "agreed" | "dispatched" | "delivered" | "payment_pending" | "paid" | "cancelled";
  agreed_at: string;
  updated_at: string;
  contact: CounterpartyContact;
  counterparty_rating: RatingSummary;
  my_stars: number | null;
  their_stars: number | null;
};

type SaleAction = "dispatch" | "confirm_delivery" | "confirm_payment";

const STEPS = [
  { status: "agreed", label: "Agreed" },
  { status: "dispatched", label: "Dispatched" },
  { status: "delivered", label: "Delivered" },
  { status: "paid", label: "Paid" },
] as const;

/** Position of a status in the four steps (payment pending sits at "delivered"). */
function stepIndex(status: Sale["status"]): number {
  if (status === "payment_pending") return 2;
  return STEPS.findIndex((step) => step.status === status);
}

function statusText(sale: Sale): string {
  const other = sale.my_role === "farmer" ? "the buyer" : "the farmer";
  switch (sale.status) {
    case "agreed":
      return sale.my_role === "farmer"
        ? "Agreed. Mark it as dispatched when the produce leaves."
        : `Agreed. Waiting for ${other} to dispatch; confirm when you receive it.`;
    case "dispatched":
      return sale.my_role === "buyer"
        ? "Dispatched. Confirm when the produce reaches you."
        : `Dispatched. Waiting for ${other} to confirm delivery.`;
    case "delivered":
    case "payment_pending":
      return sale.my_role === "farmer"
        ? "Delivered. Confirm once you have received the payment."
        : `Delivered. Waiting for ${other} to confirm the payment.`;
    case "paid":
      return "Completed: delivered and paid.";
    case "cancelled":
      return "Cancelled.";
  }
}

function nextAction(sale: Sale): { action: SaleAction; label: string } | null {
  if (sale.my_role === "farmer" && sale.status === "agreed") {
    return { action: "dispatch", label: "Mark as dispatched" };
  }
  if (sale.my_role === "buyer" && (sale.status === "agreed" || sale.status === "dispatched")) {
    return { action: "confirm_delivery", label: "Confirm delivery received" };
  }
  if (
    sale.my_role === "farmer" &&
    (sale.status === "delivered" || sale.status === "payment_pending")
  ) {
    return { action: "confirm_payment", label: "Confirm payment received" };
  }
  return null;
}

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

function formatDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
        date,
      );
}

/**
 * Sales the signed-in farmer or buyer takes part in: where each one stands,
 * the next step that is theirs to take, the other side's contact details, and
 * a rating once the produce has been delivered.
 */
export function SalesBoard() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/sales", { cache: "no-store" });
        const result = (await response.json()) as { sales?: Sale[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Your sales could not be loaded.");
        if (active) setSales(result.sales ?? []);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Your sales could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function advance(sale: Sale, action: SaleAction) {
    setBusyId(sale.id);
    setError("");
    try {
      const response = await fetch("/api/sales", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: sale.id, action }),
      });
      const result = (await response.json()) as {
        sale?: { id: string; status: Sale["status"]; updated_at: string };
        error?: string;
      };
      if (!response.ok || !result.sale) {
        throw new Error(result.error ?? "The sale could not be updated.");
      }
      const updated = result.sale;
      setSales((current) =>
        current.map((item) =>
          item.id === updated.id
            ? { ...item, status: updated.status, updated_at: updated.updated_at }
            : item,
        ),
      );
    } catch (advanceError) {
      setError(
        advanceError instanceof Error ? advanceError.message : "The sale could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="sales-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="sales-heading">
            My sales
          </h2>
          <p className="panel-caption">
            {loading
              ? "Loading…"
              : `${sales.length} sale(s). A sale starts when an offer is accepted; each side confirms its own step.`}
          </p>
        </div>
      </div>

      {error ? (
        <p className="form-alert" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="empty-state">
          <p className="empty-copy" role="status">
            Loading your sales…
          </p>
        </div>
      ) : sales.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">No sales yet</h3>
          <p className="empty-copy">
            When a buyer&apos;s offer is accepted, the sale appears here with the steps to complete
            it.
          </p>
        </div>
      ) : (
        <ul className="sale-list">
          {sales.map((sale) => {
            const other = sale.my_role === "farmer" ? "buyer" : "farmer";
            const reached = stepIndex(sale.status);
            const next = nextAction(sale);
            const canRate =
              (sale.status === "delivered" ||
                sale.status === "payment_pending" ||
                sale.status === "paid") &&
              sale.my_stars === null;
            return (
              <li className="sale-card" key={sale.id}>
                <div className="sale-card-head">
                  <div>
                    <strong>
                      {sale.crop}
                      {sale.variety ? ` (${sale.variety})` : ""}
                    </strong>
                    <span>
                      {sale.agreed_quantity} {sale.unit} at{" "}
                      {rupees(sale.agreed_price_paise_per_quintal)} per quintal · agreed{" "}
                      {formatDay(sale.agreed_at)}
                    </span>
                  </div>
                  <span className={`produce-status produce-status-${sale.status}`}>
                    {sale.status === "payment_pending" ? "delivered" : sale.status}
                  </span>
                </div>

                {sale.status !== "cancelled" ? (
                  <ol className="sale-steps" aria-label="Progress of this sale">
                    {STEPS.map((step, index) => (
                      <li
                        key={step.status}
                        className={index <= reached ? "sale-step sale-step-done" : "sale-step"}
                        aria-current={index === reached ? "step" : undefined}
                      >
                        {step.label}
                      </li>
                    ))}
                  </ol>
                ) : null}

                <p className="sale-status-text">{statusText(sale)}</p>

                {next ? (
                  <div>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void advance(sale, next.action)}
                      disabled={busyId === sale.id}
                    >
                      {busyId === sale.id ? "Saving…" : next.label}
                    </button>
                  </div>
                ) : null}

                <div className="sale-card-people">
                  <ContactCard
                    title={other === "buyer" ? "Buyer" : "Farmer"}
                    contact={sale.contact}
                    hiddenHint="Contact details are not available."
                  />
                  <RatingBadge
                    summary={sale.counterparty_rating}
                    label={`This ${other}'s rating`}
                  />
                </div>

                {canRate ? (
                  <RateForm
                    contextType="sale"
                    contextId={sale.id}
                    who={`the ${other}`}
                    onRated={(stars) =>
                      setSales((current) =>
                        current.map((item) =>
                          item.id === sale.id ? { ...item, my_stars: stars } : item,
                        ),
                      )
                    }
                  />
                ) : sale.my_stars !== null ? (
                  <p className="form-help">
                    You rated the {other} {sale.my_stars} out of 5.
                  </p>
                ) : null}
                {sale.their_stars !== null ? (
                  <p className="form-help">
                    The {other} rated you {sale.their_stars} out of 5.
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
