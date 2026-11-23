"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type MatchLot = {
  id: string;
  crop: string;
  variety: string | null;
  grade: string | null;
  quantity: number;
  unit: string;
  locationArea: string | null;
  availableAt: string;
  sellBy: string | null;
};

type MatchResult = {
  lot: MatchLot;
  score: number;
  match: {
    lotId: string;
    requirementId: string;
    status: "match" | "partial" | "no_match";
    reasons: string[];
    unknowns: string[];
  };
};

type RequirementMatches = {
  requirementId: string;
  crop: string;
  marketArea: string;
  minQuantity: number;
  unit: string;
  deliveryBy: string | null;
  results: MatchResult[];
};

type MatchResponse = {
  matches: RequirementMatches[];
  metadata: {
    method: string;
    version: string;
    scoreMeaning: string;
    locationMeaning: string;
    priceMeaning: string;
  };
};

function dateLabel(value: string | null) {
  if (!value) return "No delivery date specified";
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

export function BuyerMatchResults() {
  const [result, setResult] = useState<MatchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void fetch("/api/buyer-matches", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as MatchResponse | { error?: string };
        if (!response.ok) {
          throw new Error("error" in payload ? payload.error ?? "Matches could not be loaded." : "Matches could not be loaded.");
        }
        if (active) setResult(payload as MatchResponse);
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(requestError instanceof Error ? requestError.message : "Matches could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="buyer-matches">
      {loading ? (
        <section className="panel empty-state">
          <p className="empty-copy" role="status">Comparing your active requirements with published lots…</p>
        </section>
      ) : error ? (
        <section className="panel empty-state">
          <p className="empty-copy" role="alert">{error}</p>
        </section>
      ) : !result || result.matches.length === 0 ? (
        <section className="panel empty-state">
          <h2 className="empty-title">No active buying requirements</h2>
          <p className="empty-copy">
            Create a requirement first. Farmess will compare it with currently published produce lots.
          </p>
          <Link href="/buyer/requirements" className="button button-primary" style={{ marginTop: 16 }}>
            Create a requirement
          </Link>
        </section>
      ) : (
        <>
          {result.matches.map((group) => {
            const exact = group.results.filter((item) => item.match.status === "match");
            const partial = group.results.filter((item) => item.match.status === "partial");
            const visible = exact.length ? [...exact, ...partial].slice(0, 8) : partial.slice(0, 8);

            return (
              <section className="panel buyer-match-group" key={group.requirementId}>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Active requirement</p>
                    <h2 className="panel-title">{group.crop}</h2>
                    <p className="panel-caption">
                      {group.marketArea} · At least {group.minQuantity} {group.unit}
                      {" · "}{dateLabel(group.deliveryBy)}
                    </p>
                  </div>
                  <span className="buyer-match-count">
                    {exact.length} exact · {partial.length} partial
                  </span>
                </div>

                {visible.length === 0 ? (
                  <div className="empty-state">
                    <h3 className="empty-title">No suitable published lot found</h3>
                    <p className="empty-copy">
                      No current lot satisfies the crop, quantity, locality and date rules. You can adjust the requirement or check the marketplace again later.
                    </p>
                    <Link href="/buyer/requirements" className="text-link">
                      Review this requirement
                    </Link>
                  </div>
                ) : (
                  <ul className="buyer-match-list">
                    {visible.map((item) => (
                      <li className="buyer-match-row" key={item.lot.id}>
                        <div className="buyer-match-main">
                          <div className="buyer-match-title">
                            <strong>{item.lot.crop}{item.lot.variety ? ` · ${item.lot.variety}` : ""}</strong>
                            <span className={"produce-status produce-status-" + item.match.status}>
                              {item.match.status === "match" ? "Rule match" : "Partial match"}
                            </span>
                          </div>
                          <p>
                            {[item.lot.grade, item.lot.locationArea ?? "Approximate locality not shared"]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                          <span>
                            {item.lot.quantity} {item.lot.unit}
                            {" · Available "}{dateLabel(item.lot.availableAt)}
                            {" · Sell by "}{dateLabel(item.lot.sellBy)}
                          </span>

                          {item.match.reasons.length ? (
                            <ul className="buyer-match-reasons">
                              {item.match.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                            </ul>
                          ) : null}
                          {item.match.unknowns.length ? (
                            <p className="buyer-match-unknown">
                              Confirm: {item.match.unknowns.join(" ")}
                            </p>
                          ) : null}
                        </div>
                        <div className="buyer-match-actions">
                          <span>{item.score}/100 rule coverage</span>
                          <Link href="/buyer/marketplace" className="text-link">
                            Review lot and offer →
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          <p className="market-forecast-footnote">
            This is a deterministic rule match, not an ML probability or a guarantee that the farmer will sell. Farmess does not currently have a lot asking price, so price fit is not scored.
          </p>
        </>
      )}
    </div>
  );
}
