"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { ContactCard, type CounterpartyContact } from "@/features/contacts/contact-card";
import { RatingBadge } from "@/features/ratings/rating-badge";
import type { RatingSummary } from "@/features/ratings/rating";

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
> & {
  lot: Pick<Database["public"]["Tables"]["produce_lots"]["Row"], "id" | "crop" | "variety"> | null;
  is_expired: boolean;
  contact?: CounterpartyContact | null;
  buyer_rating?: RatingSummary | null;
};

type OfferDecision = "accepted" | "declined";

function formatMoneyInPaise(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function formatDate(value: string) {
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

export function OfferInbox() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadOffers() {
      try {
        const response = await fetch("/api/offers", { cache: "no-store" });
        const result = (await response.json()) as { offers?: Offer[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Buyer offers could not be loaded.");
        if (active) setOffers(result.offers ?? []);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Buyer offers could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadOffers();
    return () => {
      active = false;
    };
  }, []);

  async function decide(id: string, decision: OfferDecision) {
    setPendingId(id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/offers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) throw new Error(result.error ?? "The offer could not be updated.");

      setOffers((current) =>
        current.map((offer) => (offer.id === id ? { ...offer, status: decision } : offer)),
      );
      setMessage(
        decision === "accepted"
          ? "Offer accepted. The agreed sale has been recorded and you can now see the buyer's contact details."
          : "Offer declined.",
      );
      if (decision === "accepted") {
        // Reload so the buyer's contact details (shared on acceptance) appear.
        const refreshed = await fetch("/api/offers", { cache: "no-store" });
        const payload = (await refreshed.json()) as { offers?: Offer[] };
        if (refreshed.ok && payload.offers) setOffers(payload.offers);
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The offer could not be updated.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="panel offer-panel" aria-labelledby="offer-inbox-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="offer-inbox-heading">
            Offers received
          </h2>
          <p className="panel-caption">
            {loading ? "Loading…" : `${offers.length} offer(s) on your produce`}
          </p>
        </div>
      </div>

      {error ? (
        <p className="form-alert notification-alert" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success notification-alert" role="status">
          {message}
        </p>
      ) : null}

      {loading ? (
        <div className="empty-state">
          <p className="empty-copy" role="status">
            Loading buyer offers…
          </p>
        </div>
      ) : offers.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">No offers received</h3>
          <p className="empty-copy">
            Offers linked to your produce will appear here. Draft lots are private; publish a lot
            from My produce so buyers can see it and make offers.
          </p>
        </div>
      ) : (
        <ul className="offer-list">
          {offers.map((offer) => {
            const expired = offer.is_expired;
            const effectiveStatus =
              offer.status === "pending" && expired ? "expired" : offer.status;

            return (
              <li className="offer-item" key={offer.id}>
                <div className="offer-main">
                  <div className="offer-title-row">
                    <h3>{offer.lot?.crop ?? "Produce lot"}</h3>
                    <span className={"produce-status produce-status-" + effectiveStatus}>
                      {effectiveStatus.charAt(0).toUpperCase() + effectiveStatus.slice(1)}
                    </span>
                  </div>
                  <p className="offer-terms">
                    {offer.lot?.variety ? `${offer.lot.variety} · ` : ""}
                    {offer.quantity} {offer.unit} offered at{" "}
                    <strong>{formatMoneyInPaise(offer.price_paise_per_quintal)} / quintal</strong>
                  </p>
                  {offer.terms ? <p className="offer-note">{offer.terms}</p> : null}
                  <p className="offer-dates">
                    Received {formatDate(offer.created_at)} · Valid until{" "}
                    {formatDate(offer.valid_until)}
                  </p>
                  <p className="offer-dates">
                    Buyer: <RatingBadge summary={offer.buyer_rating} label="This buyer's rating" />
                  </p>
                  <ContactCard
                    title="Buyer"
                    contact={offer.contact}
                    hiddenHint={
                      offer.status === "pending"
                        ? "Accept the offer to exchange phone and email with this buyer."
                        : "Contact details are shared only for accepted offers."
                    }
                  />
                </div>
                {offer.status === "pending" ? (
                  <div className="offer-actions">
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => void decide(offer.id, "declined")}
                      disabled={pendingId === offer.id}
                    >
                      {pendingId === offer.id ? "Saving…" : "Decline"}
                    </button>
                    <button
                      type="button"
                      className="button button-primary"
                      onClick={() => void decide(offer.id, "accepted")}
                      disabled={pendingId === offer.id || expired}
                      title={expired ? "This offer has expired." : undefined}
                    >
                      Accept offer
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
