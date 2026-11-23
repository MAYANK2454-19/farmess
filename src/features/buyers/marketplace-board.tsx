"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Lot = Pick<
  Database["public"]["Tables"]["produce_lots"]["Row"],
  | "id"
  | "crop"
  | "variety"
  | "grade"
  | "quantity"
  | "unit"
  | "approximate_area"
  | "available_from"
  | "sell_by"
>;

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

function formatDate(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatDateTime(value: string) {
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

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function OfferForm({ lot, onSent }: { lot: Lot; onSent: (offer: Offer) => void }) {
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [terms, setTerms] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const quantityValue = Number(quantity);
    const priceRupees = Number(price);
    if (!Number.isFinite(quantityValue) || quantityValue <= 0 || quantityValue > lot.quantity) {
      setError("Enter a positive quantity that does not exceed the listed quantity.");
      setPending(false);
      return;
    }
    if (!Number.isFinite(priceRupees) || priceRupees <= 0 || Math.round(priceRupees * 100) <= 0) {
      setError("Enter a valid price in rupees per quintal.");
      setPending(false);
      return;
    }
    if (!validUntil) {
      setError("Choose when this offer expires.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/marketplace", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          lot_id: lot.id,
          quantity: quantityValue,
          unit: lot.unit,
          price_paise_per_quintal: Math.round(priceRupees * 100),
          valid_until: new Date(validUntil).toISOString(),
          terms: terms.trim() || null,
        }),
      });
      const result = (await response.json()) as { offer?: Offer; error?: string };
      if (!response.ok || !result.offer) {
        throw new Error(result.error ?? "Your offer could not be sent.");
      }

      onSent(result.offer);
      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Your offer could not be sent.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <p className="form-success marketplace-sent" role="status">
        Offer sent. You can follow the decision in My Offers.
      </p>
    );
  }

  return (
    <details className="marketplace-offer-details">
      <summary>Make an offer</summary>
      <form className="marketplace-offer-form" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">Quantity ({lot.unit})</span>
          <input
            className="form-control"
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            max={lot.quantity}
            placeholder="Quantity"
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Price (₹ per quintal)</span>
          <input
            className="form-control"
            inputMode="decimal"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="e.g. 2350"
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Offer expires</span>
          <input
            className="form-control"
            type="datetime-local"
            value={validUntil}
            onChange={(event) => setValidUntil(event.target.value)}
            required
          />
        </label>
        <label className="form-field marketplace-offer-terms">
          <span className="form-label">Additional terms (optional)</span>
          <textarea
            className="form-control"
            rows={3}
            value={terms}
            onChange={(event) => setTerms(event.target.value)}
            maxLength={1000}
            placeholder="Delivery, grading or other agreed terms"
          />
        </label>
        {error ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="button button-primary" disabled={pending}>
          {pending ? "Sending…" : "Send offer"}
        </button>
      </form>
    </details>
  );
}

export function MarketplaceBoard() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void fetch("/api/marketplace", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          lots?: Lot[];
          offers?: Offer[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Marketplace could not be loaded.");
        if (active) {
          setLots(result.lots ?? []);
          setOffers(result.offers ?? []);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Marketplace could not be loaded.",
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

  function addOffer(offer: Offer) {
    setOffers((current) => [offer, ...current]);
  }

  const offersByLot = new Map(offers.map((offer) => [offer.lot_id, offer]));

  return (
    <div className="marketplace-board">
      <section className="panel" aria-labelledby="published-lots-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="published-lots-heading">
              Published produce lots
            </h2>
            <p className="panel-caption">Only active farmer listings are shown here.</p>
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
              Loading published lots…
            </p>
          </div>
        ) : lots.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-title">No published produce available</h3>
            <p className="empty-copy">
              There are no active farmer listings to show right now. Draft and paused lots stay out
              of this marketplace.
            </p>
          </div>
        ) : (
          <div className="marketplace-lot-list">
            {lots.map((lot) => {
              const existing = offersByLot.get(lot.id);
              const activeOffer = existing && existing.status === "pending" && !existing.is_expired;
              return (
                <article className="marketplace-lot" key={lot.id}>
                  <div className="marketplace-lot-heading">
                    <div>
                      <p className="eyebrow">Produce listing</p>
                      <h3>
                        {lot.crop}
                        {lot.variety ? ` · ${lot.variety}` : ""}
                      </h3>
                      <p>{[lot.grade, lot.approximate_area].filter(Boolean).join(" · ")}</p>
                    </div>
                    <strong>
                      {lot.quantity} {lot.unit}
                    </strong>
                  </div>
                  <p className="marketplace-lot-dates">
                    Available from {formatDate(lot.available_from)} · Sell by{" "}
                    {formatDate(lot.sell_by)}
                  </p>
                  {activeOffer ? (
                    <p className="marketplace-existing-offer">
                      Your offer is awaiting a farmer decision. It expires{" "}
                      {formatDateTime(existing.valid_until)}.
                    </p>
                  ) : (
                    <OfferForm lot={lot} onSent={addOffer} />
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="buyer-offers-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="buyer-offers-heading">
              Offers you have sent
            </h2>
            <p className="panel-caption">{offers.length} offer(s)</p>
          </div>
        </div>
        {offers.length === 0 ? (
          <div className="empty-state">
            <p className="empty-copy">Your sent offers will appear here.</p>
          </div>
        ) : (
          <ul className="buyer-offer-list">
            {offers.map((offer) => (
              <li className="buyer-offer-row" key={offer.id}>
                <div>
                  <strong>{formatPrice(offer.price_paise_per_quintal)} / quintal</strong>
                  <span>
                    {offer.quantity} {offer.unit} · expires {formatDateTime(offer.valid_until)}
                  </span>
                  <time dateTime={offer.created_at}>Sent {formatDateTime(offer.created_at)}</time>
                </div>
                <span
                  className={
                    "produce-status produce-status-" +
                    (offer.is_expired && offer.status === "pending" ? "expired" : offer.status)
                  }
                >
                  {offer.is_expired && offer.status === "pending" ? "Expired" : offer.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
