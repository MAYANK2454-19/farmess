"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Offer = Pick<
  Database["public"]["Tables"]["offers"]["Row"],
  | "id"
  | "lot_id"
  | "quantity"
  | "unit"
  | "price_paise_per_quintal"
  | "valid_until"
  | "status"
  | "terms"
  | "created_at"
> & { is_expired: boolean };

function money(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function when(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export function BuyerOfferHistory() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/marketplace", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { offers?: Offer[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Your offers could not be loaded.");
        if (active) setOffers(result.offers ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Your offers could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function withdraw(id: string) {
    setPendingId(id);
    setError("");
    try {
      const response = await fetch("/api/buyer-offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The offer could not be withdrawn.");
      setOffers((current) =>
        current.map((offer) => (offer.id === id ? { ...offer, status: "withdrawn" } : offer)),
      );
    } catch (withdrawError) {
      setError(
        withdrawError instanceof Error
          ? withdrawError.message
          : "The offer could not be withdrawn.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="buyer-offer-history-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="buyer-offer-history-heading">
            Offers sent
          </h2>
          <p className="panel-caption">{loading ? "Loading…" : `${offers.length} sent offer(s)`}</p>
        </div>
      </div>
      {error ? (
        <p className="form-alert service-alert" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="empty-state">
          <p className="empty-copy" role="status">
            Loading offers…
          </p>
        </div>
      ) : offers.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">No offers sent</h3>
          <p className="empty-copy">
            When you make an offer on a published produce lot, the terms and farmer decision will
            appear here.
          </p>
        </div>
      ) : (
        <ul className="buyer-offer-list">
          {offers.map((offer) => {
            const expired = offer.is_expired && offer.status === "pending";
            const status = expired ? "expired" : offer.status;
            return (
              <li className="buyer-offer-row" key={offer.id}>
                <div>
                  <strong>{money(offer.price_paise_per_quintal)} / quintal</strong>
                  <span>
                    {offer.quantity} {offer.unit} · {status}
                  </span>
                  <span>Valid until {when(offer.valid_until)}</span>
                  <time dateTime={offer.created_at}>Sent {when(offer.created_at)}</time>
                  {offer.terms ? <p>{offer.terms}</p> : null}
                </div>
                {offer.status === "pending" && !expired ? (
                  <button
                    className="text-link"
                    type="button"
                    onClick={() => void withdraw(offer.id)}
                    disabled={pendingId === offer.id}
                  >
                    {pendingId === offer.id ? "Withdrawing…" : "Withdraw offer"}
                  </button>
                ) : (
                  <span className={"produce-status produce-status-" + status}>{status}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
