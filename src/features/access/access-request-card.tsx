"use client";

import { useEffect, useState } from "react";
import type { RequestableRole } from "@/features/access/access-request";

type AccessRequest = {
  id: string;
  requested_role: RequestableRole;
  organisation_name: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const ROLE_LABEL: Record<RequestableRole, string> = {
  buyer: "Buyer",
  operator: "Transport & storage operator",
};

const STATUS_LABEL: Record<AccessRequest["status"], string> = {
  pending: "Waiting for review",
  approved: "Approved — sign out and sign in again",
  rejected: "Not approved",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function AccessRequestCard({ defaultName }: { defaultName: string }) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RequestableRole>("buyer");
  const [name, setName] = useState(defaultName);
  const [organisation, setOrganisation] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/access-requests", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { requests?: AccessRequest[] }) => {
        if (active) setRequests(result.requests ?? []);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const pending = requests.find((request) => request.status === "pending");

  async function submit() {
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          requested_role: role,
          requester_name: name,
          organisation_name: organisation,
          reason,
        }),
      });
      const result = (await response.json()) as { request?: AccessRequest; error?: string };
      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "Your request could not be submitted.");
      }
      setRequests((current) => [result.request as AccessRequest, ...current]);
      setMessage("Request submitted. An admin will review it.");
      setReason("");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Your request could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="panel access-card" aria-labelledby="access-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="access-heading">
            Buyer or service-provider access
          </h2>
          <p className="panel-caption">
            Buyer and transport/storage accounts are verified by a Farmess admin before they can
            make offers or list services.
          </p>
        </div>
        <span className="privacy-badge">Reviewed</span>
      </div>

      {requests.length > 0 ? (
        <ul className="access-request-list">
          {requests.map((request) => (
            <li key={request.id} className={"access-request access-request-" + request.status}>
              <div>
                <strong>{ROLE_LABEL[request.requested_role]}</strong>
                <span>
                  {request.organisation_name} · requested {formatDate(request.created_at)}
                </span>
                {request.review_note && request.status !== "pending" ? (
                  <span className="access-review-note">Admin note: {request.review_note}</span>
                ) : null}
              </div>
              <span className={"produce-status produce-status-" + request.status}>
                {STATUS_LABEL[request.status]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {loading ? (
        <p className="form-help access-card-body">Loading your requests…</p>
      ) : pending ? (
        <p className="form-help access-card-body">
          Your request is waiting for review. You can submit another after it is decided.
        </p>
      ) : (
        <form
          className="access-card-body"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="form-field full">
            <span className="form-label">Access needed</span>
            <div className="choice-pills" role="radiogroup" aria-label="Access needed">
              {(Object.keys(ROLE_LABEL) as RequestableRole[]).map((option) => (
                <label
                  key={option}
                  className={"choice-pill" + (role === option ? " selected" : "")}
                >
                  <input
                    type="radio"
                    name="requested_role"
                    checked={role === option}
                    onChange={() => setRole(option)}
                  />
                  {ROLE_LABEL[option]}
                </label>
              ))}
            </div>
          </div>
          <div className="profile-form-grid">
            <label className="form-field">
              <span className="form-label">Your name</span>
              <input
                className="form-control"
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={80}
                required
              />
            </label>
            <label className="form-field">
              <span className="form-label">Organisation or business</span>
              <input
                className="form-control"
                value={organisation}
                onChange={(event) => setOrganisation(event.target.value)}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label className="form-field full">
              <span className="form-label">What you do and why you need access</span>
              <textarea
                className="form-control"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={20}
                maxLength={500}
                required
                placeholder="e.g. We buy tomatoes weekly for retail stores in Jammu."
              />
            </label>
          </div>
          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success" role="status">
              {message}
            </p>
          ) : null}
          <div className="profile-footer">
            <p className="form-warning">Admin access cannot be requested.</p>
            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Request access"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
