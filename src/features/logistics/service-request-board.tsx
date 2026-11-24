"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Listing = Pick<
  Database["public"]["Tables"]["service_listings"]["Row"],
  | "id"
  | "title"
  | "service_type"
  | "service_area"
  | "destination_area"
  | "description"
  | "price_paise"
  | "capacity_quantity"
  | "capacity_unit"
  | "available_from"
  | "available_until"
  | "rate_basis"
  | "service_radius_km"
  | "crop_suitability"
  | "cold_chain_available"
  | "verification_state"
>;

type ServiceRequest = Pick<
  Database["public"]["Tables"]["service_requests"]["Row"],
  | "id"
  | "listing_id"
  | "origin_area"
  | "destination_area"
  | "requested_date"
  | "requested_quantity"
  | "unit"
  | "status"
  | "message"
  | "created_at"
>;

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

function formatPrice(value: number | null, basis: string) {
  if (value === null) return "Ask provider for a quote";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
  return `${amount} · ${basis.replaceAll("_", " ")}`;
}

function ListingCard({
  listing,
  onRequested,
}: {
  listing: Listing;
  onRequested: (request: ServiceRequest) => void;
}) {
  const [originArea, setOriginArea] = useState("");
  const [destinationArea, setDestinationArea] = useState(listing.destination_area ?? "");
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("quintal");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const numericQuantity = quantity.trim() ? Number(quantity) : null;
    if (
      quantity.trim() &&
      (!Number.isFinite(numericQuantity) || numericQuantity === null || numericQuantity <= 0)
    ) {
      setError("Enter a valid positive quantity.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          listing_id: listing.id,
          origin_area: originArea.trim() || null,
          destination_area: destinationArea.trim() || null,
          requested_date: date || null,
          requested_quantity: numericQuantity,
          unit: numericQuantity === null ? null : unit,
          message: message.trim() || null,
        }),
      });

      const result = (await response.json()) as {
        request?: ServiceRequest;
        error?: string;
      };
      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "Your service request could not be sent.");
      }

      onRequested(result.request);
      setSent(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Your service request could not be sent.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="service-listing">
      <div className="service-listing-heading">
        <div>
          <p className="eyebrow">
            {listing.service_type === "transport" ? "Transport" : "Storage"}
          </p>
          <h3>{listing.title}</h3>
        </div>
        <strong className="service-price">
          {formatPrice(listing.price_paise, listing.rate_basis)}
        </strong>
      </div>
      <p className="service-area">
        {listing.service_area}
        {listing.destination_area ? ` → ${listing.destination_area}` : ""}
      </p>
      {listing.description ? <p className="service-description">{listing.description}</p> : null}
      <p className="service-availability">
        Available {formatDate(listing.available_from)}
        {listing.available_until ? ` to ${formatDate(listing.available_until)}` : ""}
        {listing.capacity_quantity !== null
          ? ` · Capacity ${listing.capacity_quantity} ${listing.capacity_unit ?? ""}`
          : ""}
        {listing.service_radius_km ? ` · Service radius ${listing.service_radius_km} km` : ""}
      </p>
      <div className="service-listing-tags">
        <span>{listing.verification_state.replaceAll("_", " ")}</span>
        {listing.cold_chain_available ? <span>Cold-chain service</span> : null}
        {listing.crop_suitability.length ? (
          <span>Suitable for {listing.crop_suitability.join(", ")}</span>
        ) : (
          <span>Crop suitability not specified</span>
        )}
      </div>

      {sent ? (
        <p className="form-success service-sent" role="status">
          Request sent. You can follow its status under “My requests”.
        </p>
      ) : (
        <details className="service-request-details">
          <summary>Request this service</summary>
          <form className="service-request-form" onSubmit={submit}>
            <label className="form-field">
              <span className="form-label">Collection / origin area</span>
              <input
                className="form-control"
                value={originArea}
                onChange={(event) => setOriginArea(event.target.value)}
                maxLength={160}
                placeholder="Village or market area"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Destination area</span>
              <input
                className="form-control"
                value={destinationArea}
                onChange={(event) => setDestinationArea(event.target.value)}
                maxLength={160}
                placeholder="Where the produce should go"
              />
            </label>
            <label className="form-field">
              <span className="form-label">Requested date</span>
              <input
                className="form-control"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <div className="form-field">
              <span className="form-label">Quantity (optional)</span>
              <div className="service-quantity">
                <input
                  className="form-control"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  placeholder="e.g. 10"
                />
                <select
                  className="form-control"
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  aria-label="Quantity unit"
                >
                  <option value="kg">kg</option>
                  <option value="quintal">quintal</option>
                  <option value="tonne">tonne</option>
                </select>
              </div>
            </div>
            <label className="form-field service-message">
              <span className="form-label">Message (optional)</span>
              <textarea
                className="form-control"
                rows={3}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1000}
                placeholder="Share details the provider needs to assess your request"
              />
            </label>
            {error ? (
              <p className="form-alert" role="alert">
                {error}
              </p>
            ) : null}
            <button className="button button-primary" type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send service request"}
            </button>
          </form>
        </details>
      )}
    </article>
  );
}

export function ServiceRequestBoard() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [requests, setRequests] = useState<ServiceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/service-requests", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          listings?: Listing[];
          requests?: ServiceRequest[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Services could not be loaded.");
        }
        if (active) {
          setListings(result.listings ?? []);
          setRequests(result.requests ?? []);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Services could not be loaded.",
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

  function addRequest(request: ServiceRequest) {
    setRequests((current) => [request, ...current]);
  }

  const listingTitle = (id: string) =>
    listings.find((listing) => listing.id === id)?.title ?? "Service listing";

  async function cancelRequest(id: string) {
    setCancellingId(id);
    setError("");

    try {
      const response = await fetch("/api/service-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const result = (await response.json()) as {
        request?: { id: string; status: string; updated_at: string };
        error?: string;
      };

      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "This service request could not be cancelled.");
      }

      setRequests((current) =>
        current.map((item) =>
          item.id === id ? { ...item, status: "cancelled" } : item,
        ),
      );
      setCancelConfirmId(null);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "This service request could not be cancelled.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="service-board">
      <section className="panel" aria-labelledby="service-listings-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="service-listings-heading">
              Available services
            </h2>
            <p className="panel-caption">
              Active transport and storage listings from service providers
            </p>
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
              Loading services…
            </p>
          </div>
        ) : listings.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-title">No active services listed</h3>
            <p className="empty-copy">
              When verified transport and storage providers publish a service, it will appear here.
            </p>
          </div>
        ) : (
          <div className="service-list">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onRequested={addRequest} />
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="service-requests-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="service-requests-heading">
              My requests
            </h2>
            <p className="panel-caption">{requests.length} request(s) from your account</p>
          </div>
        </div>
        {requests.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-title">No service requests yet</h3>
            <p className="empty-copy">
              Requests you send to a provider will appear here with their current status.
            </p>
          </div>
        ) : (
          <ul className="service-request-list">
            {requests.map((request) => (
              <li className="service-request-row" key={request.id}>
                <div>
                  <strong>{listingTitle(request.listing_id)}</strong>
                  <span>
                    {request.origin_area ?? "Origin not specified"}
                    {request.destination_area ? ` → ${request.destination_area}` : ""}
                  </span>
                  <time dateTime={request.created_at}>
                    Requested {formatDate(request.created_at.slice(0, 10))}
                  </time>
                </div>
                <span className={"produce-status produce-status-" + request.status}>
                  {request.status}
                </span>
                {request.status === "pending" || request.status === "accepted" ? (
                  <div className="service-request-cancel">
                    {cancelConfirmId === request.id ? (
                      <>
                        <span>Cancel this request?</span>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => void cancelRequest(request.id)}
                          disabled={cancellingId === request.id}
                        >
                          {cancellingId === request.id ? "Cancelling…" : "Confirm cancel"}
                        </button>
                        <button
                          type="button"
                          className="text-link"
                          onClick={() => setCancelConfirmId(null)}
                          disabled={cancellingId === request.id}
                        >
                          Keep request
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="text-link"
                        onClick={() => setCancelConfirmId(request.id)}
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
