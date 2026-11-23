"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Notification = Pick<
  Database["public"]["Tables"]["notifications"]["Row"],
  "id" | "title" | "body" | "event_key" | "created_at" | "read_at" | "related_type" | "related_id"
>;

function formatDate(value: string) {
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

export function NotificationList() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/notifications", { cache: "no-store" });
        const result = (await response.json()) as {
          notifications?: Notification[];
          error?: string;
        };
        if (!response.ok) throw new Error(result.error ?? "Notifications could not be loaded.");
        if (active) setItems(result.notifications ?? []);
      } catch (loadError) {
        if (active)
          setError(
            loadError instanceof Error ? loadError.message : "Notifications could not be loaded.",
          );
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function markRead(id: string) {
    setPendingId(id);
    setError("");
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The notification could not be updated.");

      setItems((current) =>
        current.map((item) =>
          item.id === id ? { ...item, read_at: item.read_at ?? new Date().toISOString() } : item,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The notification could not be updated.",
      );
    } finally {
      setPendingId(null);
    }
  }

  const unreadCount = items.filter((item) => !item.read_at).length;

  return (
    <section className="panel notification-panel" aria-labelledby="notification-list-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="notification-list-heading">
            Your notifications
          </h2>
          <p className="panel-caption">
            {loading ? "Loading…" : `${unreadCount} unread · ${items.length} recent`}
          </p>
        </div>
      </div>

      {error ? (
        <p className="form-alert notification-alert" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="empty-state">
          <p className="empty-copy" role="status">
            Loading notifications…
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">No notifications yet</h3>
          <p className="empty-copy">
            Updates about offers and service requests will appear here when they are created for
            your account.
          </p>
        </div>
      ) : (
        <ul className="notification-list">
          {items.map((item) => (
            <li className={"notification-item" + (item.read_at ? "" : " unread")} key={item.id}>
              <div className="notification-copy">
                <div className="notification-title-row">
                  <strong>{item.title}</strong>
                  {!item.read_at ? <span className="notification-unread">New</span> : null}
                </div>
                <p>{item.body}</p>
                <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
              </div>
              {!item.read_at ? (
                <button
                  type="button"
                  className="text-link notification-read"
                  onClick={() => void markRead(item.id)}
                  disabled={pendingId === item.id}
                >
                  {pendingId === item.id ? "Saving…" : "Mark read"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
