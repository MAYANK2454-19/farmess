"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  PROVIDER_VERIFICATION_STATES,
  type ProviderVerificationState,
} from "./provider-verification";

export type AdminProviderListing = {
  id: string;
  operator_id: string;
  title: string;
  service_type: string;
  service_area: string;
  destination_area: string | null;
  description: string | null;
  price_paise: number | null;
  rate_basis: string;
  capacity_quantity: number | null;
  capacity_unit: string | null;
  available_from: string | null;
  available_until: string | null;
  status: string;
  verification_state: string;
  created_at: string;
  updated_at: string;
};

export type ProviderVerificationEvent = {
  id: string;
  listing_id: string;
  reviewed_by_user_id: string;
  previous_state: string;
  new_state: string;
  review_note: string;
  created_at: string;
};

const STATE_LABELS: Record<ProviderVerificationState, string> = {
  unverified: "Unverified",
  contact_verified: "Contact verified",
  document_verified: "Documents verified",
  platform_verified: "Platform verified",
  suspended: "Suspended",
};

function dateLabel(value: string | null) {
  if (!value) return "Not specified";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function moneyLabel(paise: number | null, rateBasis: string) {
  if (paise === null) return "Quote required";
  return `${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100)} · ${rateBasis.replaceAll("_", " ")}`;
}

export function AdminProviderVerificationConsole({
  initialListings,
  initialEvents,
}: {
  initialListings: AdminProviderListing[];
  initialEvents: ProviderVerificationEvent[];
}) {
  const router = useRouter();
  const [listings, setListings] = useState(initialListings);
  const [states, setStates] = useState<Record<string, ProviderVerificationState>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submitReview(event: FormEvent<HTMLFormElement>, listing: AdminProviderListing) {
    event.preventDefault();
    if (busyId) return;

    const verificationState =
      states[listing.id] ?? (listing.verification_state as ProviderVerificationState);
    const reviewNote = notes[listing.id] ?? "";
    if (reviewNote.trim().length < 20 || reviewNote.trim().length > 500) {
      setError("Review note must contain 20 to 500 characters.");
      setMessage("");
      return;
    }

    setBusyId(listing.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/provider-verification", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: listing.id,
          verification_state: verificationState,
          review_note: reviewNote,
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok)
        throw new Error(payload.error ?? "The verification decision could not be saved.");

      setListings((current) =>
        current.map((item) =>
          item.id === listing.id ? { ...item, verification_state: verificationState } : item,
        ),
      );
      setMessage(payload.message ?? "Verification decision saved.");
      setNotes((current) => ({ ...current, [listing.id]: "" }));
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The verification decision could not be saved.",
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="admin-stack">
      {error ? (
        <p className="admin-error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="admin-success" role="status">
          {message}
        </p>
      ) : null}
      <section className="admin-candidate-list">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Provider listings requiring review or action</h2>
            <p className="panel-caption">
              Verify contact or documents only after checking evidence outside this form. Platform
              verification is a trust decision, not a guarantee of service quality or availability.
            </p>
          </div>
          <span className="admin-status">{listings.length} listings loaded</span>
        </div>
        {listings.length === 0 ? (
          <div className="panel admin-empty">
            <strong>No provider listings are available to review.</strong>
            <p>New operator listings begin as unverified. Verified listings remain available here for later review or suspension.</p>
          </div>
        ) : (
          listings.map((listing) => (
            <article className="panel admin-candidate" key={listing.id}>
              <div className="admin-candidate-heading">
                <div>
                  <p className="eyebrow">
                    {listing.service_type} · {listing.service_area}
                  </p>
                  <h3>{listing.title}</h3>
                  <p className="panel-caption">
                    Listing {listing.id} · Operator {listing.operator_id}
                  </p>
                </div>
                <span className="admin-status">
                  {STATE_LABELS[listing.verification_state as ProviderVerificationState] ??
                    listing.verification_state}
                </span>
              </div>
              {listing.description ? <p>{listing.description}</p> : null}
              <div className="admin-metrics">
                <span>
                  Destination <strong>{listing.destination_area ?? "Not specified"}</strong>
                </span>
                <span>
                  Rate <strong>{moneyLabel(listing.price_paise, listing.rate_basis)}</strong>
                </span>
                <span>
                  Capacity{" "}
                  <strong>
                    {listing.capacity_quantity === null
                      ? "Not specified"
                      : `${listing.capacity_quantity} ${listing.capacity_unit ?? ""}`}
                  </strong>
                </span>
                <span>
                  Availability{" "}
                  <strong>
                    {dateLabel(listing.available_from)} – {dateLabel(listing.available_until)}
                  </strong>
                </span>
                <span>
                  Listing status <strong>{listing.status}</strong>
                </span>
                <span>
                  Submitted <strong>{dateLabel(listing.created_at.slice(0, 10))}</strong>
                </span>
              </div>
              <form
                className="admin-verification-form"
                onSubmit={(event) => void submitReview(event, listing)}
              >
                <label>
                  Platform decision
                  <select
                    value={
                      states[listing.id] ??
                      (listing.verification_state as ProviderVerificationState)
                    }
                    onChange={(event) =>
                      setStates((current) => ({
                        ...current,
                        [listing.id]: event.target.value as ProviderVerificationState,
                      }))
                    }
                    disabled={busyId === listing.id}
                  >
                    {PROVIDER_VERIFICATION_STATES.map((state) => (
                      <option value={state} key={state}>
                        {STATE_LABELS[state]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Review note (20–500 characters)
                  <textarea
                    value={notes[listing.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [listing.id]: event.target.value }))
                    }
                    minLength={20}
                    maxLength={500}
                    rows={3}
                    required
                    placeholder="Record which contact or documents were checked and why this decision was made."
                    disabled={busyId === listing.id}
                  />
                </label>
                <button
                  className="button button-primary"
                  type="submit"
                  disabled={busyId === listing.id}
                >
                  {busyId === listing.id ? "Saving review…" : "Save verification decision"}
                </button>
              </form>
            </article>
          ))
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-section-heading">
          <h2>Recent verification audit</h2>
          <p>
            Every successful decision records the previous state, new state, reviewer and reason.
          </p>
        </div>
        {initialEvents.length === 0 ? (
          <div className="admin-empty">
            <strong>No verification decisions have been recorded.</strong>
            <p>Review events will appear here after an admin saves a decision.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="produce-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Change</th>
                  <th>Reviewer</th>
                  <th>Reason</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {initialEvents.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <code>{item.listing_id}</code>
                    </td>
                    <td>
                      {STATE_LABELS[item.previous_state as ProviderVerificationState] ??
                        item.previous_state}{" "}
                      →{" "}
                      {STATE_LABELS[item.new_state as ProviderVerificationState] ?? item.new_state}
                    </td>
                    <td>
                      <code>{item.reviewed_by_user_id}</code>
                    </td>
                    <td>{item.review_note}</td>
                    <td>{dateLabel(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
