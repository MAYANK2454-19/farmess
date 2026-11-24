"use client";

import { useState } from "react";
import type { AccessDecision, RequestableRole } from "@/features/access/access-request";

export type AdminAccessRequest = {
  id: string;
  requested_role: RequestableRole;
  requester_name: string;
  organisation_name: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

const ROLE_LABEL: Record<RequestableRole, string> = {
  buyer: "Buyer",
  operator: "Transport & storage",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function RequestRow({
  request,
  onReviewed,
}: {
  request: AdminAccessRequest;
  onReviewed: (updated: AdminAccessRequest, message: string) => void;
}) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<AccessDecision | null>(null);
  const [error, setError] = useState("");

  async function review(decision: AccessDecision) {
    setPending(decision);
    setError("");
    try {
      const response = await fetch("/api/admin/access-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: request.id, decision, review_note: note }),
      });
      const result = (await response.json()) as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "The decision could not be saved.");
      onReviewed(
        {
          ...request,
          status: decision,
          review_note: note.trim(),
          reviewed_at: new Date().toISOString(),
        },
        result.message ?? "Decision saved.",
      );
    } catch (reviewError) {
      setError(
        reviewError instanceof Error ? reviewError.message : "The decision could not be saved.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <li className="access-admin-item">
      <div className="access-admin-head">
        <div>
          <strong>{request.requester_name}</strong>
          <span>
            {request.organisation_name} · wants <b>{ROLE_LABEL[request.requested_role]}</b> access
          </span>
        </div>
        <span className={"produce-status produce-status-" + request.status}>
          {request.status === "pending"
            ? "Pending"
            : request.status === "approved"
              ? "Approved"
              : "Rejected"}
        </span>
      </div>
      <p className="access-admin-reason">“{request.reason}”</p>
      <p className="access-admin-meta">Requested {formatDate(request.created_at)}</p>

      {request.status === "pending" ? (
        <div className="access-admin-review">
          <label className="form-field">
            <span className="form-label">Review note (required)</span>
            <input
              className="form-control"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              minLength={10}
              maxLength={500}
              placeholder="e.g. Verified trade licence and phone call with owner."
            />
          </label>
          <div className="access-admin-actions">
            <button
              type="button"
              className="button button-secondary"
              disabled={pending !== null || note.trim().length < 10}
              onClick={() => void review("rejected")}
            >
              {pending === "rejected" ? "Rejecting…" : "Reject"}
            </button>
            <button
              type="button"
              className="button button-primary"
              disabled={pending !== null || note.trim().length < 10}
              onClick={() => void review("approved")}
            >
              {pending === "approved"
                ? "Approving…"
                : `Approve ${ROLE_LABEL[request.requested_role]}`}
            </button>
          </div>
          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="access-admin-meta">
          Reviewed {request.reviewed_at ? formatDate(request.reviewed_at) : ""} —{" "}
          {request.review_note}
        </p>
      )}
    </li>
  );
}

export function AdminAccessRequestConsole({
  initialRequests,
}: {
  initialRequests: AdminAccessRequest[];
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [message, setMessage] = useState("");

  const pending = requests.filter((request) => request.status === "pending");
  const reviewed = requests.filter((request) => request.status !== "pending");

  function onReviewed(updated: AdminAccessRequest, notice: string) {
    setRequests((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setMessage(notice);
  }

  return (
    <div className="access-admin">
      <section className="stat-grid" aria-label="Access request summary">
        <article className={"stat-card" + (pending.length > 0 ? " stat-card-warning" : "")}>
          <p className="stat-value">{pending.length}</p>
          <p className="stat-label">Waiting for review</p>
          <p className="stat-hint">Buyer and operator requests</p>
        </article>
        <article className="stat-card">
          <p className="stat-value">
            {reviewed.filter((request) => request.status === "approved").length}
          </p>
          <p className="stat-label">Approved</p>
          <p className="stat-hint">Users must sign in again to switch</p>
        </article>
        <article className="stat-card">
          <p className="stat-value">
            {reviewed.filter((request) => request.status === "rejected").length}
          </p>
          <p className="stat-label">Rejected</p>
          <p className="stat-hint">Kept with the review note</p>
        </article>
      </section>

      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}

      <section className="panel" aria-labelledby="pending-heading">
        <header className="panel-header">
          <div>
            <h2 className="panel-title" id="pending-heading">
              Waiting for review
            </h2>
            <p className="panel-caption">
              Verify the organisation before approving. Every decision needs a note.
            </p>
          </div>
        </header>
        {pending.length === 0 ? (
          <div className="empty-state">
            <h3 className="empty-title">No pending requests</h3>
            <p className="empty-copy">
              New buyer and transport &amp; storage requests from farmer accounts appear here.
            </p>
          </div>
        ) : (
          <ul className="access-admin-list">
            {pending.map((request) => (
              <RequestRow key={request.id} request={request} onReviewed={onReviewed} />
            ))}
          </ul>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section className="panel" aria-labelledby="reviewed-heading">
          <header className="panel-header">
            <div>
              <h2 className="panel-title" id="reviewed-heading">
                Reviewed
              </h2>
              <p className="panel-caption">Audit trail of past decisions.</p>
            </div>
          </header>
          <ul className="access-admin-list">
            {reviewed.map((request) => (
              <RequestRow key={request.id} request={request} onReviewed={onReviewed} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
