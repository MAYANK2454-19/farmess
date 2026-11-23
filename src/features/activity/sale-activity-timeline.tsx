"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";

type SaleActivity = Pick<
  Database["public"]["Tables"]["sale_activity"]["Row"],
  "id" | "event_key" | "summary" | "created_at" | "sale_id"
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

export function SaleActivityTimeline() {
  const [items, setItems] = useState<SaleActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const response = await fetch("/api/activity", { cache: "no-store" });
        const result = (await response.json()) as { activity?: SaleActivity[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Sale activity could not be loaded.");
        if (active) setItems(result.activity ?? []);
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Sale activity could not be loaded.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel activity-panel" aria-labelledby="activity-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="activity-heading">Sale timeline</h2>
          <p className="panel-caption">
            {loading ? "Loading…" : `${items.length} update(s) on sales you participate in`}
          </p>
        </div>
      </div>

      {error ? <p className="form-alert notification-alert" role="alert">{error}</p> : null}
      {loading ? (
        <div className="empty-state"><p className="empty-copy" role="status">Loading sale activity…</p></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-title">No sale activity yet</h3>
          <p className="empty-copy">
            Updates will appear here when a buyer offer is accepted and a sale is recorded.
          </p>
        </div>
      ) : (
        <ol className="activity-list">
          {items.map((item) => (
            <li className="activity-item" key={item.id}>
              <span className="activity-marker" aria-hidden="true" />
              <div>
                <p>{item.summary}</p>
                <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
