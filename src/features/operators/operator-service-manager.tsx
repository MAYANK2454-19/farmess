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
  | "status"
  | "created_at"
>;

function money(value: number | null) {
  if (value === null) return "Price by agreement";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
}

export function OperatorServiceManager() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [serviceType, setServiceType] = useState("transport");
  const [serviceArea, setServiceArea] = useState("");
  const [destination, setDestination] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const [capacityUnit, setCapacityUnit] = useState("quintal");
  const [availableFrom, setAvailableFrom] = useState("");
  const [availableUntil, setAvailableUntil] = useState("");

  useEffect(() => {
    let active = true;

    void fetch("/api/operator/services", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { listings?: Listing[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Service listings could not be loaded.");
        if (active) setListings(result.listings ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Service listings could not be loaded.",
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

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const priceValue = price.trim() ? Number(price) : null;
    const capacityValue = capacity.trim() ? Number(capacity) : null;

    if (
      (priceValue !== null && (!Number.isFinite(priceValue) || priceValue <= 0)) ||
      (capacityValue !== null && (!Number.isFinite(capacityValue) || capacityValue <= 0))
    ) {
      setError("Check the price and capacity fields.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/operator/services", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          title,
          service_type: serviceType,
          service_area: serviceArea,
          destination_area: destination.trim() || null,
          description: description.trim() || null,
          price_paise: priceValue === null ? null : Math.round(priceValue * 100),
          capacity_quantity: capacityValue,
          capacity_unit: capacityValue === null ? null : capacityUnit,
          available_from: availableFrom || null,
          available_until: availableUntil || null,
        }),
      });

      const result = (await response.json()) as { listing?: Listing; error?: string };
      if (!response.ok || !result.listing) {
        throw new Error(result.error ?? "The service listing could not be published.");
      }

      setListings((current) => [result.listing!, ...current]);
      setTitle("");
      setServiceArea("");
      setDestination("");
      setDescription("");
      setPrice("");
      setCapacity("");
      setAvailableFrom("");
      setAvailableUntil("");
      setMessage("Your service is now active and visible to farmers.");
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "The service listing could not be published.");
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: "active" | "paused" | "closed") {
    setPendingId(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/operator/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = (await response.json()) as { listing?: { id: string; status: string }; error?: string };
      if (!response.ok || !result.listing) {
        throw new Error(result.error ?? "The listing status could not be changed.");
      }
      setListings((current) => current.map((item) => item.id === id ? { ...item, status } : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The listing status could not be changed.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="operator-services">
      <section className="panel" aria-labelledby="new-service-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="new-service-heading">Publish a service</h2>
            <p className="panel-caption">Only the details entered here are shown to farmers.</p>
          </div>
        </div>
        <form className="operator-service-form" onSubmit={publish}>
          <label className="form-field">
            <span className="form-label">Service title</span>
            <input className="form-control" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} required placeholder="e.g. Tractor transport within district" />
          </label>
          <label className="form-field">
            <span className="form-label">Service type</span>
            <select className="form-control" value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
              <option value="transport">Transport</option>
              <option value="storage">Storage</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Service area</span>
            <input className="form-control" value={serviceArea} onChange={(event) => setServiceArea(event.target.value)} maxLength={160} required placeholder="District or service zone" />
          </label>
          <label className="form-field">
            <span className="form-label">Destination (optional)</span>
            <input className="form-control" value={destination} onChange={(event) => setDestination(event.target.value)} maxLength={160} placeholder="Destination area" />
          </label>
          <label className="form-field">
            <span className="form-label">Price in ₹ (optional)</span>
            <input className="form-control" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="Leave blank for quote" />
          </label>
          <div className="form-field">
            <span className="form-label">Capacity (optional)</span>
            <div className="service-quantity">
              <input className="form-control" inputMode="decimal" value={capacity} onChange={(event) => setCapacity(event.target.value)} placeholder="Quantity" />
              <select className="form-control" value={capacityUnit} onChange={(event) => setCapacityUnit(event.target.value)} aria-label="Capacity unit">
                <option value="kg">kg</option>
                <option value="quintal">quintal</option>
                <option value="tonne">tonne</option>
              </select>
            </div>
          </div>
          <label className="form-field">
            <span className="form-label">Available from</span>
            <input className="form-control" type="date" value={availableFrom} onChange={(event) => setAvailableFrom(event.target.value)} />
          </label>
          <label className="form-field">
            <span className="form-label">Available until</span>
            <input className="form-control" type="date" value={availableUntil} onChange={(event) => setAvailableUntil(event.target.value)} />
          </label>
          <label className="form-field operator-description">
            <span className="form-label">Service details</span>
            <textarea className="form-control" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Describe vehicles, storage conditions, coverage or other relevant details." />
          </label>
          {error ? <p className="form-alert operator-feedback" role="alert">{error}</p> : null}
          {message ? <p className="form-success operator-feedback" role="status">{message}</p> : null}
          <div className="buyer-form-footer">
            <p className="form-warning">Publishing makes this listing visible to signed-in farmers.</p>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Publishing…" : "Publish service"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="operator-listings-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="operator-listings-heading">Your service listings</h2>
            <p className="panel-caption">{loading ? "Loading…" : `${listings.length} listing(s)`}</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p className="empty-copy" role="status">Loading listings…</p></div>
        ) : listings.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-title">No services published</h3>
            <p className="empty-copy">Add a transport or storage service above to make it available to farmers.</p>
          </div>
        ) : (
          <ul className="operator-listing-list">
            {listings.map((listing) => (
              <li className="operator-listing-row" key={listing.id}>
                <div>
                  <strong>{listing.title}</strong>
                  <span>{listing.service_type} · {listing.service_area}{listing.destination_area ? ` → ${listing.destination_area}` : ""}</span>
                  <time dateTime={listing.created_at}>{money(listing.price_paise)}</time>
                </div>
                <div className="operator-listing-actions">
                  <span className={"produce-status produce-status-" + listing.status}>{listing.status}</span>
                  {listing.status !== "closed" ? (
                    <>
                      <button className="text-link" type="button" disabled={pendingId === listing.id} onClick={() => void updateStatus(listing.id, listing.status === "active" ? "paused" : "active")}>
                        {listing.status === "active" ? "Pause" : "Activate"}
                      </button>
                      <button className="text-link" type="button" disabled={pendingId === listing.id} onClick={() => void updateStatus(listing.id, "closed")}>Close</button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
