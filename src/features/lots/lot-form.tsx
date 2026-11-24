"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/icons";
import styles from "./lot-form.module.css";
import {
  validateLotDraft,
  type LotDraftInput,
  type LotField,
  type LotValidationErrors,
} from "@/features/lots/lot-validation";

const initialDraft: LotDraftInput = {
  crop: "",
  variety: "",
  grade: "",
  quantity: "",
  unit: "quintal",
  location: "",
  availableAt: "",
  sellBy: "",
  notes: "",
};

function displayValue(value: string) {
  return value.trim() || "Not provided";
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span className={styles.formError} id={id}>
      {message}
    </span>
  );
}

export function LotForm() {
  const router = useRouter();
  const [draft, setDraft] = useState<LotDraftInput>(initialDraft);
  const [errors, setErrors] = useState<LotValidationErrors>({});
  const [review, setReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function update<K extends LotField>(key: K, value: LotDraftInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      if (key === "availableAt" || key === "sellBy") {
        delete next.availableAt;
        delete next.sellBy;
      }
      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateLotDraft(draft);
    setErrors(result.errors);

    if (!result.data) return;

    setDraft(result.data);
    setSaveError("");
    setReview(true);
  }

  async function handleSaveDraft() {
    setSaving(true);
    setSaveError("");

    try {
      const response = await fetch("/api/produce-lots", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(draft),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        setSaveError(result.error ?? "Your lot could not be saved. Please try again.");
        setSaving(false);
        return;
      }

      router.push("/farmer/produce");
      router.refresh();
    } catch {
      setSaveError("A connection error prevented the lot from being saved. Please try again.");
      setSaving(false);
    }
  }

  if (review) {
    return (
      <section className="panel module-card" aria-labelledby="review-lot-heading">
        <div className="module-status">Step 2 of 2 · Review before saving</div>
        <h2 id="review-lot-heading">Review your produce lot</h2>
        <p>
          Check the information below before saving. New lots are stored as private drafts and are
          not visible to buyers.
        </p>
        <div className="review-grid">
          <div className="review-item">
            <span>Produce / commodity</span>
            <strong>{displayValue(draft.crop)}</strong>
          </div>
          <div className="review-item">
            <span>Variety</span>
            <strong>{displayValue(draft.variety)}</strong>
          </div>
          <div className="review-item">
            <span>Quality / grade</span>
            <strong>{displayValue(draft.grade)}</strong>
          </div>
          <div className="review-item">
            <span>Available quantity</span>
            <strong>
              {draft.quantity} {draft.unit}
            </strong>
          </div>
          <div className="review-item">
            <span>Pickup area</span>
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
          <div className={"review-item " + styles.reviewItemFull}>
            <span>Additional notes</span>
            <strong>{displayValue(draft.notes)}</strong>
          </div>
        </div>
        <div className={styles.reviewNote} role="note">
          Your exact address and GPS coordinates are not required here. A saved draft remains
          private to your account until a separate publish step is available.
        </div>
        {saveError ? (
          <div className={styles.formAlert} role="alert">
            {saveError}
          </div>
        ) : null}
        <div className="form-footer">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setReview(false)}
            disabled={saving}
          >
            Edit details
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void handleSaveDraft()}
            disabled={saving}
          >
            {saving ? "Saving draft…" : "Save private draft"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="panel module-card" onSubmit={handleSubmit} noValidate>
      <div className="module-status">Step 1 of 2 · Lot details</div>
      <h2>Produce lot details</h2>
      <p>
        Enter what you have available and when it can be collected. Use a village, locality or
        nearby market area rather than an exact home address.
      </p>
      {Object.keys(errors).length > 0 ? (
        <div className={styles.formAlert} role="alert">
          Review the marked fields and correct the information before opening the lot review.
        </div>
      ) : null}
      <div className="form-grid">
        <label className="form-field">
          <span className="form-label">Produce / commodity *</span>
          <input
            id="lot-crop"
            className="form-control"
            value={draft.crop}
            onChange={(event) => update("crop", event.target.value)}
            placeholder="e.g. Tomato"
            maxLength={80}
            autoComplete="off"
            aria-required="true"
            aria-invalid={Boolean(errors.crop)}
            aria-describedby={errors.crop ? "lot-crop-error" : undefined}
          />
          <FieldError id="lot-crop-error" message={errors.crop} />
        </label>
        <label className="form-field">
          <span className="form-label">Variety</span>
          <input
            id="lot-variety"
            className="form-control"
            value={draft.variety}
            onChange={(event) => update("variety", event.target.value)}
            placeholder="Enter variety when known"
            maxLength={80}
            autoComplete="off"
            aria-invalid={Boolean(errors.variety)}
            aria-describedby={errors.variety ? "lot-variety-error" : undefined}
          />
          <FieldError id="lot-variety-error" message={errors.variety} />
        </label>
        <label className="form-field">
          <span className="form-label">Quality / grade</span>
          <select
            id="lot-grade"
            className="form-control"
            value={draft.grade}
            onChange={(event) => update("grade", event.target.value)}
            aria-invalid={Boolean(errors.grade)}
            aria-describedby={errors.grade ? "lot-grade-error" : undefined}
          >
            <option value="">Select if known</option>
            <option value="A">A</option>
            <option value="B">B</option>
            <option value="C">C</option>
            <option value="Not graded">Not graded</option>
          </select>
          <FieldError id="lot-grade-error" message={errors.grade} />
          <span className="form-help">
            You can leave this blank when the produce is not graded.
          </span>
        </label>
        <div className="form-field">
          <span className="form-label">Available quantity *</span>
          <div className={styles.quantityControls}>
            <label className={styles.visuallyHidden} htmlFor="lot-quantity">
              Quantity
            </label>
            <input
              id="lot-quantity"
              className="form-control"
              type="text"
              inputMode="decimal"
              value={draft.quantity}
              onChange={(event) => update("quantity", event.target.value)}
              placeholder="e.g. 10"
              maxLength={18}
              aria-required="true"
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby={errors.quantity ? "lot-quantity-error" : "lot-quantity-help"}
            />
            <label className={styles.visuallyHidden} htmlFor="lot-unit">
              Quantity unit
            </label>
            <select
              id="lot-unit"
              className="form-control"
              value={draft.unit}
              onChange={(event) => update("unit", event.target.value)}
              aria-invalid={Boolean(errors.unit)}
              aria-describedby={errors.unit ? "lot-unit-error" : undefined}
            >
              <option value="quintal">Quintal</option>
              <option value="kg">Kilogram</option>
              <option value="tonne">Tonne</option>
            </select>
          </div>
          <FieldError id="lot-quantity-error" message={errors.quantity} />
          <FieldError id="lot-unit-error" message={errors.unit} />
          <span className="form-help" id="lot-quantity-help">
            Enter a positive amount using up to three decimal places.
          </span>
        </div>
        <label className="form-field full">
          <span className="form-label">Pickup area / nearby market *</span>
          <input
            id="lot-location"
            className="form-control"
            value={draft.location}
            onChange={(event) => update("location", event.target.value)}
            placeholder="Village / locality / nearby market area"
            maxLength={160}
            autoComplete="off"
            aria-required="true"
            aria-invalid={Boolean(errors.location)}
            aria-describedby={errors.location ? "lot-location-error" : "lot-location-help"}
          />
          <FieldError id="lot-location-error" message={errors.location} />
          <span className="form-help" id="lot-location-help">
            Your exact address and GPS coordinates are not needed for this step.
          </span>
        </label>
        <label className="form-field">
          <span className="form-label">Available from *</span>
          <input
            id="lot-available-at"
            className="form-control"
            type="date"
            value={draft.availableAt}
            onChange={(event) => update("availableAt", event.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.availableAt)}
            aria-describedby={errors.availableAt ? "lot-available-at-error" : undefined}
          />
          <FieldError id="lot-available-at-error" message={errors.availableAt} />
        </label>
        <label className="form-field">
          <span className="form-label">Sell by / urgency *</span>
          <input
            id="lot-sell-by"
            className="form-control"
            type="date"
            min={draft.availableAt || undefined}
            value={draft.sellBy}
            onChange={(event) => update("sellBy", event.target.value)}
            aria-required="true"
            aria-invalid={Boolean(errors.sellBy)}
            aria-describedby={errors.sellBy ? "lot-sell-by-error" : undefined}
          />
          <FieldError id="lot-sell-by-error" message={errors.sellBy} />
        </label>
        <label className="form-field full">
          <span className="form-label">Additional notes</span>
          <textarea
            id="lot-notes"
            className={"form-control " + styles.formTextarea}
            value={draft.notes}
            onChange={(event) => update("notes", event.target.value)}
            placeholder="Optional details about handling, packaging or collection"
            maxLength={1000}
            rows={4}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? "lot-notes-error" : "lot-notes-help"}
          />
          <FieldError id="lot-notes-error" message={errors.notes} />
          <span className="form-help" id="lot-notes-help">
            Optional, up to 1,000 characters.
          </span>
        </label>
      </div>
      <div className="form-footer">
        <p className="form-warning">The lot is saved as a private draft after your review.</p>
        <button className="button button-primary" type="submit">
          Review lot details <Icon name="chevron" size={15} />
        </button>
      </div>
      <div className={styles.formBackLink}>
        <Link className="text-link" href="/farmer">
          ← Back to overview
        </Link>
      </div>
    </form>
  );
}
