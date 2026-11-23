"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Requirement = Pick<
  Database["public"]["Tables"]["buyer_requirements"]["Row"],
  | "id"
  | "crop"
  | "variety"
  | "grade"
  | "market_area"
  | "min_quantity"
  | "max_quantity"
  | "unit"
  | "target_price_paise_per_quintal"
  | "delivery_by"
  | "status"
  | "created_at"
>;

function priceLabel(value: number | null) {
  if (value === null) return "No target price set";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100) + " / quintal";
}

function dateLabel(value: string | null) {
  if (!value) return "No delivery date";
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

export function BuyerRequirementsManager() {
  const [items, setItems] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [crop, setCrop] = useState("");
  const [variety, setVariety] = useState("");
  const [grade, setGrade] = useState("");
  const [marketArea, setMarketArea] = useState("");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [unit, setUnit] = useState("quintal");
  const [price, setPrice] = useState("");
  const [deliveryBy, setDeliveryBy] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/buyer-requirements", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          requirements?: Requirement[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Requirements could not be loaded.");
        if (active) setItems(result.requirements ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Requirements could not be loaded.",
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

  async function createRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");

    const minValue = Number(minimum);
    const maxValue = maximum.trim() ? Number(maximum) : null;
    const priceRupees = price.trim() ? Number(price) : null;

    if (
      !Number.isFinite(minValue) ||
      minValue <= 0 ||
      (maxValue !== null && (!Number.isFinite(maxValue) || maxValue < minValue)) ||
      (priceRupees !== null && (!Number.isFinite(priceRupees) || priceRupees <= 0))
    ) {
      setError("Check the quantity range and target price.");
      setSaving(false);
      return;
    }

    try {
      const response = await fetch("/api/buyer-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          crop,
          variety: variety.trim() || null,
          grade: grade.trim() || null,
          market_area: marketArea,
          min_quantity: minValue,
          max_quantity: maxValue,
          unit,
          target_price_paise_per_quintal:
            priceRupees === null ? null : Math.round(priceRupees * 100),
          delivery_by: deliveryBy || null,
        }),
      });
      const result = (await response.json()) as {
        requirement?: Requirement;
        error?: string;
      };
      if (!response.ok || !result.requirement) {
        throw new Error(result.error ?? "Your requirement could not be saved.");
      }

      setItems((current) => [result.requirement!, ...current]);
      setCrop("");
      setVariety("");
      setGrade("");
      setMarketArea("");
      setMinimum("");
      setMaximum("");
      setPrice("");
      setDeliveryBy("");
      setMessage("Your buying requirement is now active.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your requirement could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(id: string, status: "active" | "paused" | "closed") {
    setPendingId(id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/buyer-requirements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const result = (await response.json()) as { requirement?: { id: string; status: string }; error?: string };
      if (!response.ok || !result.requirement) {
        throw new Error(result.error ?? "The requirement could not be updated.");
      }
      setItems((current) =>
        current.map((item) => item.id === id ? { ...item, status } : item),
      );
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : "The requirement could not be updated.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="buyer-requirements">
      <section className="panel" aria-labelledby="new-requirement-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="new-requirement-heading">Create a buying requirement</h2>
            <p className="panel-caption">Describe the produce, quantity range and delivery area you need.</p>
          </div>
        </div>
        <form className="buyer-requirement-form" onSubmit={createRequirement}>
          <label className="form-field">
            <span className="form-label">Crop</span>
            <input className="form-control" value={crop} onChange={(event) => setCrop(event.target.value)} required maxLength={80} placeholder="e.g. Wheat" />
          </label>
          <label className="form-field">
            <span className="form-label">Variety (optional)</span>
            <input className="form-control" value={variety} onChange={(event) => setVariety(event.target.value)} maxLength={80} />
          </label>
          <label className="form-field">
            <span className="form-label">Grade (optional)</span>
            <input className="form-control" value={grade} onChange={(event) => setGrade(event.target.value)} maxLength={40} placeholder="e.g. FAQ" />
          </label>
          <label className="form-field">
            <span className="form-label">Market / delivery area</span>
            <input className="form-control" value={marketArea} onChange={(event) => setMarketArea(event.target.value)} required maxLength={120} placeholder="Town, market or district" />
          </label>
          <label className="form-field">
            <span className="form-label">Minimum quantity</span>
            <input className="form-control" inputMode="decimal" value={minimum} onChange={(event) => setMinimum(event.target.value)} required placeholder="e.g. 5" />
          </label>
          <label className="form-field">
            <span className="form-label">Maximum quantity (optional)</span>
            <input className="form-control" inputMode="decimal" value={maximum} onChange={(event) => setMaximum(event.target.value)} placeholder="e.g. 20" />
          </label>
          <label className="form-field">
            <span className="form-label">Quantity unit</span>
            <select className="form-control" value={unit} onChange={(event) => setUnit(event.target.value)}>
              <option value="kg">kg</option>
              <option value="quintal">quintal</option>
              <option value="tonne">tonne</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Target price in ₹ per quintal (optional)</span>
            <input className="form-control" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="e.g. 2400" />
          </label>
          <label className="form-field">
            <span className="form-label">Need by (optional)</span>
            <input className="form-control" type="date" value={deliveryBy} onChange={(event) => setDeliveryBy(event.target.value)} />
          </label>
          {error ? <p className="form-alert buyer-form-message" role="alert">{error}</p> : null}
          {message ? <p className="form-success buyer-form-message" role="status">{message}</p> : null}
          <div className="buyer-form-footer">
            <p className="form-warning">Only your buyer account can edit or close this requirement.</p>
            <button className="button button-primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Publish requirement"}
            </button>
          </div>
        </form>
      </section>

      <section className="panel" aria-labelledby="my-requirements-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="my-requirements-heading">My buying requirements</h2>
            <p className="panel-caption">{loading ? "Loading…" : `${items.length} requirement(s)`}</p>
          </div>
        </div>
        {loading ? (
          <div className="empty-state"><p className="empty-copy" role="status">Loading your requirements…</p></div>
        ) : items.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-title">No requirements yet</h3>
            <p className="empty-copy">Create a requirement above to record what you are looking to buy.</p>
          </div>
        ) : (
          <ul className="buyer-requirement-list">
            {items.map((item) => (
              <li className="buyer-requirement-row" key={item.id}>
                <div className="buyer-requirement-copy">
                  <div className="buyer-requirement-title">
                    <strong>{item.crop}</strong>
                    <span className={"produce-status produce-status-" + item.status}>{item.status}</span>
                  </div>
                  <p>{[item.variety, item.grade, item.market_area].filter(Boolean).join(" · ")}</p>
                  <span>
                    {item.min_quantity}{item.max_quantity !== null ? `–${item.max_quantity}` : "+"} {item.unit}
                    {" · "}{priceLabel(item.target_price_paise_per_quintal)}
                    {" · "}{dateLabel(item.delivery_by)}
                  </span>
                </div>
                <div className="buyer-requirement-actions">
                  {item.status !== "closed" ? (
                    <button
                      className="text-link"
                      type="button"
                      onClick={() => void changeStatus(item.id, item.status === "active" ? "paused" : "active")}
                      disabled={pendingId === item.id}
                    >
                      {item.status === "active" ? "Pause" : "Reactivate"}
                    </button>
                  ) : null}
                  {item.status !== "closed" ? (
                    <button className="text-link" type="button" onClick={() => void changeStatus(item.id, "closed")} disabled={pendingId === item.id}>
                      Close
                    </button>
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
