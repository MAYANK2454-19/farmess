"use client";

import { useEffect, useState } from "react";
import { RatingBadge } from "./rating-badge";
import { formatRating, type RatingSummary } from "./rating";

type Received = {
  id: string;
  stars: number;
  comment: string | null;
  context_type: "sale" | "service_request";
  created_at: string;
};

function formatDay(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(
        date,
      );
}

/** The signed-in person's own reputation and the ratings they have received. */
export function MyRatingPanel() {
  const [data, setData] = useState<{ summary: RatingSummary; received: Received[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/ratings", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as {
          summary?: RatingSummary;
          received?: Received[];
          error?: string;
        };
        if (!response.ok || !result.summary) {
          throw new Error(result.error ?? "Your ratings could not be loaded.");
        }
        if (active) setData({ summary: result.summary, received: result.received ?? [] });
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Your ratings could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="panel" aria-labelledby="my-rating-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="my-rating-heading">
            Your rating
          </h2>
          <p className="panel-caption">
            People you complete a sale or a transport/storage request with can rate you once, from 1
            to 5 stars. Others see only your average and the number of ratings.
          </p>
        </div>
        {data ? <RatingBadge summary={data.summary} label="Your rating" /> : null}
      </div>
      {error ? (
        <p className="form-alert" role="alert">
          {error}
        </p>
      ) : !data ? (
        <p className="empty-copy" role="status">
          Loading your ratings…
        </p>
      ) : data.received.length === 0 ? (
        <p className="empty-copy">
          No ratings yet. They appear here after a completed sale or service request.
        </p>
      ) : (
        <>
          <p className="form-help">{formatRating(data.summary)}</p>
          <ul className="rating-received-list">
            {data.received.map((item) => (
              <li key={item.id}>
                <strong>
                  <span aria-hidden="true">{"★".repeat(item.stars)}</span>
                  <span className="sr-only">{item.stars} out of 5</span>
                </strong>
                <span>
                  {item.context_type === "sale" ? "Sale" : "Transport or storage request"} ·{" "}
                  {formatDay(item.created_at)}
                </span>
                {item.comment ? <p>{item.comment}</p> : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
