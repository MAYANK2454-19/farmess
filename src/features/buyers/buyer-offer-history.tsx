"use client";

import { useEffect, useMemo, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import {
  countBuyerOfferStatuses,
  effectiveBuyerOfferStatus,
  filterBuyerOfferHistory,
  type BuyerOfferHistoryItem,
  type BuyerOfferHistorySort,
  type BuyerOfferHistoryStatus,
} from "./buyer-offer-history-filters";

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

const STATUS_TABS: { value: BuyerOfferHistoryStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "declined", label: "Declined" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "expired", label: "Expired" },
];

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
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<BuyerOfferHistoryStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<BuyerOfferHistorySort>("newest");

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

  const counts = useMemo(() => countBuyerOfferStatuses(offers), [offers]);
  const visibleOffers = useMemo(
    () =>
      filterBuyerOfferHistory(offers, {
        status: statusFilter,
        query: searchQuery,
        sort: sortOrder,
      }),
    [offers, statusFilter, searchQuery, sortOrder],
  );
  const hasActiveFilters =
    statusFilter !== "all" || searchQuery.trim().length > 0 || sortOrder !== "newest";

  async function withdraw(id: string) {
    setPendingId(id);
    setError("");
    setMessage("");

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
      setMessage("Offer withdrawn.");
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
          <p className="panel-caption">
            {loading ? "Loading…" : `${offers.length} sent offer(s)`}
          </p>
        </div>
      </div>
      {error ? (
        <p className="form-alert service-alert" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-success service-alert" role="status">
          {message}
        </p>
      ) : null}

      {!loading && offers.length > 0 ? (
        <div className="buyer-offer-tools">
          <div className="buyer-offer-tabs" role="group" aria-label="Filter sent offers by status">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                className="buyer-offer-tab"
                aria-pressed={statusFilter === tab.value}
                onClick={() => setStatusFilter(tab.value)}
              >
                {tab.label}
                <span className="buyer-offer-tab-count">{counts[tab.value]}</span>
              </button>
            ))}
          </div>
          <div className="buyer-offer-controls">
            <label className="buyer-offer-search-label">
              Search offers
              <input
                className="buyer-offer-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Terms, quantity, unit or price"
              />
            </label>
            <label className="buyer-offer-sort-label">
              Sort by
              <select
                className="buyer-offer-sort"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value as BuyerOfferHistorySort)}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </label>
          </div>
          <div className="buyer-offer-results">
            <span>
              Showing {visibleOffers.length} of {offers.length} offers
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                className="buyer-offer-clear"
                onClick={() => {
                  setStatusFilter("all");
                  setSearchQuery("");
                  setSortOrder("newest");
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
        </div>
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
      ) : visibleOffers.length === 0 ? (
        <div className="empty-state buyer-offer-empty">
          <h3 className="empty-title">No matching offers</h3>
          <p className="empty-copy">
            Try another status or search term. Clearing filters will show your full offer history.
          </p>
        </div>
      ) : (
        <ul className="buyer-offer-list">
          {visibleOffers.map((offer) => {
            const status = effectiveBuyerOfferStatus(offer);
            const canWithdraw = offer.status === "pending" && !offer.is_expired;

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
                {canWithdraw ? (
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
