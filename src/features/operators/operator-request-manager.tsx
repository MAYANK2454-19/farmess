"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { ContactCard, type CounterpartyContact } from "@/features/contacts/contact-card";

type RequestRow = Pick<
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
> & {
  listing: Pick<
    Database["public"]["Tables"]["service_listings"]["Row"],
    "id" | "title" | "service_type"
  > | null;
  contact?: CounterpartyContact | null;
};

function dateLabel(value: string | null) {
  if (!value) return "Date not specified";
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

function dateTimeLabel(value: string) {
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

export function OperatorRequestManager() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void fetch("/api/operator/requests", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          requests?: RequestRow[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(result.error ?? "Incoming service requests could not be loaded.");
        }
        if (active) setRequests(result.requests ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Incoming service requests could not be loaded.",
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

  async function decide(id: string, decision: "accepted" | "declined") {
    setPendingId(id);
    setError("");

    try {
      const response = await fetch("/api/operator/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const result = (await response.json()) as {
        request?: { id: string; status: string; updated_at: string };
        error?: string;
      };

      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "This request could not be updated.");
      }

      setRequests((current) =>
        current.map((item) => (item.id === id ? { ...item, status: decision } : item)),
      );
      if (decision === "accepted") await reload();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "This request could not be updated.",
      );
    } finally {
      setPendingId(null);
    }
  }

  /** Reload the list so contact details shared on acceptance appear. */
  async function reload() {
    const response = await fetch("/api/operator/requests", { cache: "no-store" });
    const result = (await response.json()) as { requests?: RequestRow[] };
    if (response.ok && result.requests) setRequests(result.requests);
  }

  async function complete(id: string) {
    setPendingId(id);
    setError("");
    try {
      const response = await fetch("/api/operator/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, action: "complete" }),
      });
      const result = (await response.json()) as { request?: { id: string }; error?: string };
      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "The request could not be marked completed.");
      }
      setRequests((current) =>
        current.map((item) => (item.id === id ? { ...item, status: "completed" } : item)),
      );
    } catch (completeError) {
      setError(
        completeError instanceof Error
          ? completeError.message
          : "The request could not be marked completed.",
      );
    } finally {
      setPendingId(null);
    }
  }

  async function cancelAccepted(id: string) {
    setPendingId(id);
    setError("");

    try {
      const response = await fetch("/api/operator/requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id, action: "cancel" }),
      });
      const result = (await response.json()) as {
        request?: { id: string; status: string; updated_at: string };
        error?: string;
      };

      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "The accepted request could not be cancelled.");
      }

      setRequests((current) =>
        current.map((item) => (item.id === id ? { ...item, status: "cancelled" } : item)),
      );
      setCancelConfirmId(null);
    } catch (cancelError) {
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : "The accepted request could not be cancelled.",
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="panel" aria-labelledby="incoming-requests-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="incoming-requests-heading">
            Incoming requests
          </h2>
          <p className="panel-caption">
            {loading ? "Loading…" : `${requests.length} request(s) for your services`}
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
            Loading requests…
          </p>
        </div>
      ) : requests.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">No incoming requests</h3>
          <p className="empty-copy">
            Requests from farmers and buyers will appear here when they ask to use one of your
            active services.
          </p>
        </div>
      ) : (
        <ul className="operator-request-list">
          {requests.map((request) => (
            <li className="operator-request-row" key={request.id}>
              <div className="operator-request-main">
                <div className="operator-request-heading">
                  <strong>{request.listing?.title ?? "Service request"}</strong>
                  <span className={"produce-status produce-status-" + request.status}>
                    {request.status}
                  </span>
                </div>
                <p className="operator-request-route">
                  {request.origin_area ?? "Origin not specified"}
                  {request.destination_area ? ` → ${request.destination_area}` : ""}
                </p>
                <p className="operator-request-detail">
                  {request.requested_quantity !== null
                    ? `${request.requested_quantity} ${request.unit ?? ""}`
                    : "Quantity not specified"}
                  {" · "}
                  {dateLabel(request.requested_date)}
                  {" · "}
                  {request.listing?.service_type ?? "Service"}
                </p>
                {request.message ? (
                  <p className="operator-request-message">{request.message}</p>
                ) : null}
                <time dateTime={request.created_at}>
                  Received {dateTimeLabel(request.created_at)}
                </time>
                <ContactCard
                  title="Requested by"
                  contact={request.contact}
                  hiddenHint={
                    request.status === "pending"
                      ? "Accept the request to exchange phone and email with this farmer."
                      : "Contact details are shared only for accepted requests."
                  }
                />
              </div>
              {request.status === "pending" ? (
                <div className="operator-request-actions">
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void decide(request.id, "declined")}
                    disabled={pendingId === request.id}
                  >
                    {pendingId === request.id ? "Saving…" : "Decline"}
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    onClick={() => void decide(request.id, "accepted")}
                    disabled={pendingId === request.id}
                  >
                    Accept request
                  </button>
                </div>
              ) : request.status === "accepted" ? (
                <div className="operator-request-actions">
                  {cancelConfirmId === request.id ? (
                    <>
                      <p className="form-warning" role="alert">
                        Cancel this accepted request? The farmer will be notified. Contact them
                        directly if arrangements were already made.
                      </p>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setCancelConfirmId(null)}
                        disabled={pendingId === request.id}
                      >
                        Keep request
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => void cancelAccepted(request.id)}
                        disabled={pendingId === request.id}
                      >
                        {pendingId === request.id ? "Cancelling…" : "Confirm cancellation"}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => void complete(request.id)}
                        disabled={pendingId === request.id}
                      >
                        {pendingId === request.id ? "Saving…" : "Mark completed"}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => setCancelConfirmId(request.id)}
                        disabled={pendingId === request.id}
                      >
                        Cancel accepted request
                      </button>
                    </>
                  )}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
