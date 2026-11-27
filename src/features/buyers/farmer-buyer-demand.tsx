"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContactCard } from "@/features/contacts/contact-card";
import { RatingBadge } from "@/features/ratings/rating-badge";
import type { RatingSummary } from "@/features/ratings/rating";

type DemandMatch = {
  requirementId: string;
  status: "match" | "partial";
  score: number;
  quantityCoveragePercent: number | null;
  fits: string[];
  gaps: string[];
  requirement: {
    crop: string;
    variety: string | null;
    grade: string | null;
    minQuantity: number;
    maxQuantity: number | null;
    unit: string;
    marketArea: string | null;
    deliveryBy: string | null;
  };
  buyer: {
    label: string;
    type: string | null;
    phone: string | null;
    email: string | null;
    rating?: RatingSummary | null;
  };
  targetPricePaisePerQuintal: number | null;
};

type DemandResponse = {
  lots?: {
    lot: {
      id: string;
      crop: string;
      variety: string | null;
      quantity: number;
      unit: string;
      area: string | null;
      status: string;
    };
    matches: DemandMatch[];
  }[];
  activeRequirements?: number;
  error?: string;
};

function dateLabel(value: string | null) {
  if (!value) return "No date set";
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(
        date,
      );
}

const rupees = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(paise / 100);

export function FarmerBuyerDemand() {
  const [result, setResult] = useState<DemandResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/farmer/buyer-demand", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as DemandResponse;
        if (!response.ok) throw new Error(payload.error ?? "Buyer demand could not be loaded.");
        if (active) setResult(payload);
      })
      .catch((error: unknown) => {
        if (active) {
          setResult({
            error: error instanceof Error ? error.message : "Buyer demand could not be loaded.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (!result) {
    return (
      <p className="empty-copy" role="status">
        Comparing your lots with buyer requirements…
      </p>
    );
  }
  if (result.error) {
    return (
      <p className="form-alert" role="alert">
        {result.error}
      </p>
    );
  }
  if (!result.lots?.length) {
    return (
      <section className="panel empty-state">
        <h3 className="empty-title">No lots to compare yet</h3>
        <p className="empty-copy">Add a produce lot and Farmess will show which buyers want it.</p>
        <Link href="/farmer/produce/new" className="button button-primary">
          Add a produce lot
        </Link>
      </section>
    );
  }

  return (
    <div className="module-stack">
      <p className="form-help">
        {result.activeRequirements ?? 0} active buyer requirement(s) on Farmess. Only the crop has
        to match; anything else that differs is listed so you can decide.
      </p>
      {result.lots.map(({ lot, matches }) => {
        const full = matches.filter((m) => m.status === "match").length;
        const partial = matches.length - full;
        return (
          <section className="panel buyer-match-group" key={lot.id}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">
                  Your lot · {lot.status === "draft" ? "Draft" : "Published"}
                </p>
                <h2 className="panel-title">
                  {lot.crop}
                  {lot.variety ? ` · ${lot.variety}` : ""}
                </h2>
                <p className="panel-caption">
                  {lot.quantity} {lot.unit}
                  {lot.area ? ` · ${lot.area}` : ""}
                </p>
              </div>
              <span className="buyer-match-count">
                {full} full · {partial} partial
              </span>
            </div>

            {matches.length === 0 ? (
              <div className="empty-state">
                <h3 className="empty-title">No buyer is asking for {lot.crop} right now</h3>
                <p className="empty-copy">
                  Keep the lot published; buyers can still find it in the marketplace.
                </p>
              </div>
            ) : (
              <ul className="buyer-match-list">
                {matches.map((m) => (
                  <li className="buyer-match-row" key={m.requirementId}>
                    <div className="buyer-match-main">
                      <div className="buyer-match-title">
                        <strong>
                          {m.buyer.label}
                          {m.buyer.type ? ` · ${m.buyer.type.replaceAll("_", " ")}` : ""}
                        </strong>
                        <RatingBadge summary={m.buyer.rating} label="This buyer's rating" />
                        <span className={"produce-status produce-status-" + m.status}>
                          {m.status === "match" ? "Full match" : "Partial match"}
                        </span>
                      </div>
                      <p>
                        Wants {m.requirement.crop}
                        {m.requirement.variety ? ` (${m.requirement.variety})` : ""}
                        {m.requirement.grade ? `, grade ${m.requirement.grade}` : ""} ·{" "}
                        {m.requirement.minQuantity}
                        {m.requirement.maxQuantity ? `–${m.requirement.maxQuantity}` : "+"}{" "}
                        {m.requirement.unit}
                        {m.requirement.marketArea ? ` · ${m.requirement.marketArea}` : ""} · by{" "}
                        {dateLabel(m.requirement.deliveryBy)}
                        {m.targetPricePaisePerQuintal
                          ? ` · target ${rupees(m.targetPricePaisePerQuintal)}/q`
                          : ""}
                      </p>
                      <ul className="buyer-match-reasons">
                        {m.fits.map((fit) => (
                          <li key={fit}>✓ {fit}</li>
                        ))}
                      </ul>
                      {m.gaps.length ? (
                        <ul className="buyer-match-reasons buyer-match-gaps">
                          {m.gaps.map((gap) => (
                            <li key={gap}>△ {gap}</li>
                          ))}
                        </ul>
                      ) : null}
                      <ContactCard
                        title="Buyer contact"
                        contact={{
                          name: m.buyer.label,
                          organisation: null,
                          phone: m.buyer.phone,
                          email: m.buyer.email,
                          sharedBecause: m.buyer.phone || m.buyer.email ? "consent" : null,
                        }}
                        hiddenHint="This buyer has not shared contact details. Publish your lot so they can see it and send you an offer."
                      />
                    </div>
                    <div className="buyer-match-actions">
                      <span>{m.score}% fit</span>
                      {m.quantityCoveragePercent !== null && m.quantityCoveragePercent < 100 ? (
                        <span>Covers {m.quantityCoveragePercent}% of their minimum</span>
                      ) : null}
                      {lot.status === "draft" ? (
                        <Link href="/farmer/produce" className="text-link">
                          Publish this lot →
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
