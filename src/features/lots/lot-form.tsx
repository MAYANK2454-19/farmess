"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

type LotDraft = {
  crop: string;
  variety: string;
  grade: string;
  quantity: string;
  unit: string;
  location: string;
  availableAt: string;
  sellBy: string;
};

const initialDraft: LotDraft = {
  crop: "",
  variety: "",
  grade: "",
  quantity: "",
  unit: "quintal",
  location: "",
  availableAt: "",
  sellBy: "",
};

function displayValue(value: string) {
  return value.trim() || "Not provided";
}

export function LotForm() {
  const [draft, setDraft] = useState<LotDraft>(initialDraft);
  const [review, setReview] = useState(false);

  function update<K extends keyof LotDraft>(key: K, value: LotDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReview(true);
  }

  if (review) {
    return (
      <section className="panel module-card">
        <div className="module-status">Local review only</div>
        <h2>Review your produce lot</h2>
        <p>
          Check the information below. This is a local prototype preview; it has not been saved or
          shared with buyers.
        </p>
        <div className="review-grid">
          <div className="review-item">
            <span>Crop</span>
            <strong>{displayValue(draft.crop)}</strong>
          </div>
          <div className="review-item">
            <span>Variety</span>
            <strong>{displayValue(draft.variety)}</strong>
          </div>
          <div className="review-item">
            <span>Grade</span>
            <strong>{displayValue(draft.grade)}</strong>
          </div>
          <div className="review-item">
            <span>Quantity</span>
            <strong>
              {draft.quantity} {draft.unit}
            </strong>
          </div>
          <div className="review-item">
            <span>Location / area</span>
            <strong>{displayValue(draft.location)}</strong>
          </div>
          <div className="review-item">
            <span>Available from</span>
            <strong>{displayValue(draft.availableAt)}</strong>
          </div>
          <div className="review-item">
            <span>Sell by</span>
            <strong>{displayValue(draft.sellBy)}</strong>
          </div>
        </div>
        <div className="form-footer">
          <p className="form-warning">
            Persistence and publishing will be connected after the shared database and permissions
            are ready.
          </p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setReview(false)}
          >
            Edit details
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="panel module-card" onSubmit={handleSubmit}>
      <div className="module-status">P0 farmer flow · form foundation</div>
      <h2>Produce lot details</h2>
      <p>
        Enter the details of the produce you plan to sell. Avoid exact home or farm coordinates; use
        a market area or locality.
      </p>
      <div className="form-grid">
        <label className="form-field">
          <span className="form-label">Crop *</span>
          <input
            className="form-control"
            value={draft.crop}
            onChange={(event) => update("crop", event.target.value)}
            placeholder="e.g. Tomato"
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Variety *</span>
          <input
            className="form-control"
            value={draft.variety}
            onChange={(event) => update("variety", event.target.value)}
            placeholder="Enter variety"
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Grade *</span>
          <select
            className="form-control"
            value={draft.grade}
            onChange={(event) => update("grade", event.target.value)}
            required
          >
            <option value="">Select grade</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="Not graded">Not graded</option>
          </select>
        </label>
        <div className="form-field">
          <span className="form-label">Quantity *</span>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 125px", gap: 8 }}>
            <input
              className="form-control"
              type="number"
              min="0.01"
              step="0.01"
              value={draft.quantity}
              onChange={(event) => update("quantity", event.target.value)}
              placeholder="e.g. 10"
              required
            />
            <select
              className="form-control"
              value={draft.unit}
              onChange={(event) => update("unit", event.target.value)}
              aria-label="Quantity unit"
            >
              <option value="quintal">Quintal</option>
              <option value="kg">Kilogram</option>
              <option value="tonne">Tonne</option>
            </select>
          </div>
        </div>
        <label className="form-field full">
          <span className="form-label">Location / market area *</span>
          <input
            className="form-control"
            value={draft.location}
            onChange={(event) => update("location", event.target.value)}
            placeholder="Village / locality / nearby market area"
            required
          />
          <span className="form-help">
            Your exact address and GPS coordinates are not needed for this step.
          </span>
        </label>
        <label className="form-field">
          <span className="form-label">Available from *</span>
          <input
            className="form-control"
            type="date"
            value={draft.availableAt}
            onChange={(event) => update("availableAt", event.target.value)}
            required
          />
        </label>
        <label className="form-field">
          <span className="form-label">Sell by / urgency *</span>
          <input
            className="form-control"
            type="date"
            min={draft.availableAt || undefined}
            value={draft.sellBy}
            onChange={(event) => update("sellBy", event.target.value)}
            required
          />
        </label>
      </div>
      <div className="form-footer">
        <p className="form-warning">Preview only — this form does not save data to a server yet.</p>
        <button className="button button-primary" type="submit">
          Review lot details <Icon name="chevron" size={15} />
        </button>
      </div>
      <div style={{ marginTop: 12 }}>
        <Link className="text-link" href="/farmer">
          ← Back to overview
        </Link>
      </div>
    </form>
  );
}
