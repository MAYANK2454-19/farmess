"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import {
  countOperatorRequests,
  filterOperatorRequests,
  type OperatorRequestQueueSort,
  type OperatorRequestQueueStatus,
} from "@/features/operators/request-queue";

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
  const [statusFilter, setStatusFilter] = useState<OperatorRequestQueueStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<OperatorRequestQueueSort>("newest");

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
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "This request could not be updated.",
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

  const queueCounts = countOperatorRequests(requests);
  const visibleRequests = filterOperatorRequests(requests, {
    status: statusFilter,
    query: searchQuery,
    sort: sortOrder,
  });
  const queueFilters = [
    { value: "all", label: "All", count: queueCounts.all },
    { value: "pending", label: "Pending", count: queueCounts.pending },
    { value: "accepted", label: "Accepted", count: queueCounts.accepted },
    { value: "closed", label: "Closed", count: queueCounts.closed },
  ] as const;

  return (
    <section className="panel" aria-labelledby="incoming-requests-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="incoming-requests-heading">
            Incoming requests
          </h2>
          <p className="panel-caption">
            {loading
              ? "Loading…"
              : `${queueCounts.pending} pending · ${queueCounts.accepted} accepted · ${queueCounts.closed} closed`}
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
        <>
          <div className="operator-request-queue">
            <div className="operator-request-queue-controls">
              <label className="operator-request-search">
                <span className="sr-only">Search incoming requests</span>
                <input
                  type="search"
                  className="form-control"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search service, route, quantity or message"
                />
              </label>
              <label className="operator-request-sort">
                <span className="sr-only">Sort incoming requests</span>
                <select
                  className="form-control"
                  value={sortOrder}
                  onChange={(event) => setSortOrder(event.target.value as OperatorRequestQueueSort)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>
            <div
              className="operator-request-filters"
              role="group"
              aria-label="Filter requests by status"
            >
              {queueFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  className={
                    statusFilter === filter.value
                      ? "operator-request-filter is-active"
                      : "operator-request-filter"
                  }
                  aria-pressed={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                >
                  {filter.label} <span>{filter.count}</span>
                </button>
              ))}
            </div>
            <p className="operator-request-result-count" aria-live="polite">
              Showing {visibleRequests.length} of {requests.length} requests
            </p>
          </div>
          {visibleRequests.length === 0 ? (
            <div className="empty-state operator-request-filter-empty">
              <h3 className="empty-title">No matching requests</h3>
              <p className="empty-copy">
                Try another status or a shorter search. Your request records have not changed.
              </p>
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setStatusFilter("all");
                  setSearchQuery("");
                  setSortOrder("newest");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : (
            <ul className="operator-request-list">
              {visibleRequests.map((request) => (
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
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => setCancelConfirmId(request.id)}
                          disabled={pendingId === request.id}
                        >
                          Cancel accepted request
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
