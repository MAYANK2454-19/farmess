"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { buildForecastCandidatePayload } from "./forecast-staging";

export type ForecastCandidate = {
  id: string;
  crop: string;
  variety: string | null;
  state: string | null;
  district: string | null;
  market_name: string;
  horizon_days: number;
  model_name: string;
  model_version: string;
  training_observation_count: number;
  validated_observation_count: number | null;
  training_start: string | null;
  training_end: string | null;
  baseline_mae_paise_per_quintal: number | null;
  model_mae_paise_per_quintal: number | null;
  baseline_smape_percent: number | null;
  model_smape_percent: number | null;
  created_at: string;
  points: Array<{
    target_date: string;
    predicted_modal_price_paise_per_quintal: number;
    lower_bound_paise_per_quintal: number | null;
    upper_bound_paise_per_quintal: number | null;
  }>;
};

function money(paise: number | null) {
  if (paise === null) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
}

function dateLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function AdminForecastConsole({
  initialCandidates,
}: {
  initialCandidates: ForecastCandidate[];
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState(initialCandidates);
  const [manifestText, setManifestText] = useState("");
  const [pointsText, setPointsText] = useState("");
  const [stagePending, setStagePending] = useState(false);
  const [stageError, setStageError] = useState("");
  const [stageMessage, setStageMessage] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState("");
  const [reviewError, setReviewError] = useState("");

  async function stageCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStagePending(true);
    setStageError("");
    setStageMessage("");

    try {
      const manifest = JSON.parse(manifestText) as unknown;
      const points = JSON.parse(pointsText) as unknown;
      const conversion = buildForecastCandidatePayload(manifest, points);
      if (!conversion.ok) throw new Error(conversion.error);

      const response = await fetch("/api/admin/market-forecasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversion.payload),
      });
      const payload = (await response.json()) as {
        candidate?: { id?: string; created_at?: string };
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "The candidate could not be staged.");

      const candidateId = payload.candidate?.id;
      const candidateCreatedAt = payload.candidate?.created_at ?? new Date().toISOString();
      if (candidateId) {
        setCandidates((current) => [
          {
            id: candidateId,
            crop: conversion.payload.crop,
            variety: conversion.payload.variety,
            state: conversion.payload.state,
            district: conversion.payload.district,
            market_name: conversion.payload.market_name,
            horizon_days: conversion.payload.horizon_days,
            model_name: conversion.payload.model_name,
            model_version: conversion.payload.model_version,
            training_observation_count: conversion.payload.training_observation_count,
            validated_observation_count: conversion.payload.validated_observation_count,
            training_start: conversion.payload.training_start,
            training_end: conversion.payload.training_end,
            baseline_mae_paise_per_quintal: conversion.payload.baseline_mae_paise_per_quintal,
            model_mae_paise_per_quintal: conversion.payload.model_mae_paise_per_quintal,
            baseline_smape_percent: conversion.payload.baseline_smape_percent,
            model_smape_percent: conversion.payload.model_smape_percent,
            created_at: candidateCreatedAt,
            points: conversion.payload.points.map((point) => ({
              ...point,
            })),
          },
          ...current.filter((candidate) => candidate.id !== candidateId),
        ]);
      }
      setManifestText("");
      setPointsText("");
      setStageMessage(payload.message ?? "Candidate staged privately for human review.");
      router.refresh();
    } catch (requestError) {
      setStageError(
        requestError instanceof Error
          ? requestError.message
          : "The candidate files could not be processed.",
      );
    } finally {
      setStagePending(false);
    }
  }

  async function reviewCandidate(id: string, decision: "approved" | "rejected") {
    const reviewNotes = notes[id]?.trim() ?? "";
    if (reviewNotes.length < 20) {
      setReviewError("Add a review note of at least 20 characters before recording a decision.");
      return;
    }

    setBusyId(id);
    setReviewError("");
    try {
      const response = await fetch("/api/admin/market-forecasts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision, review_notes: reviewNotes }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? "The review decision could not be saved.");

      setCandidates((current) => current.filter((candidate) => candidate.id !== id));
      setNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setReviewError("");
      router.refresh();
    } catch (requestError) {
      setReviewError(
        requestError instanceof Error
          ? requestError.message
          : "The review decision could not be saved.",
      );
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="admin-stack">
      <section className="panel admin-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Stage an offline model candidate</h2>
            <p className="panel-caption">
              Upload the text from one series&apos; manifest.json and forecast_points.json produced
              by ml/market_forecast/train.py. The server repeats the evaluation and date checks.
            </p>
          </div>
        </div>
        <div className="admin-notice">
          Only a candidate which beats the persistence baseline on both MAE and sMAPE can be staged.
          Staging does not publish a forecast. A separate human review is required.
        </div>
        <form className="admin-form" onSubmit={stageCandidate}>
          <label className="admin-full-field">
            manifest.json
            <textarea
              value={manifestText}
              onChange={(event) => setManifestText(event.target.value)}
              placeholder='Paste the trainer output file, for example {"domain":"market_price_forecast", ...}'
              rows={10}
              required
            />
          </label>
          <label className="admin-full-field">
            forecast_points.json
            <textarea
              value={pointsText}
              onChange={(event) => setPointsText(event.target.value)}
              placeholder='Paste the corresponding forecast points array: [{"targetDate":"YYYY-MM-DD", ...}]'
              rows={8}
              required
            />
          </label>
          {stageError ? (
            <p className="admin-error" role="alert">
              {stageError}
            </p>
          ) : null}
          {stageMessage ? (
            <p className="admin-success" role="status">
              {stageMessage}
            </p>
          ) : null}
          <button className="button button-primary" type="submit" disabled={stagePending}>
            {stagePending ? "Checking candidate…" : "Stage candidate for review"}
          </button>
        </form>
      </section>

      <section className="admin-candidate-list">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Candidates awaiting review</h2>
            <p className="panel-caption">
              Approve only after checking the source history, market identity, back-test metrics and
              forecast dates.
            </p>
          </div>
          <span className="admin-status">{candidates.length} pending</span>
        </div>

        {reviewError ? (
          <p className="admin-error" role="alert">
            {reviewError}
          </p>
        ) : null}
        {candidates.length === 0 ? (
          <div className="panel admin-empty">
            <strong>No forecast candidates are waiting for review.</strong>
            <p>
              Once real market observations are available, train a candidate and stage its two
              output files above.
            </p>
          </div>
        ) : (
          candidates.map((candidate) => (
            <article className="panel admin-candidate" key={candidate.id}>
              <div className="admin-candidate-heading">
                <div>
                  <p className="eyebrow">
                    {[candidate.state, candidate.district].filter(Boolean).join(" · ")}
                  </p>
                  <h3>
                    {candidate.crop} · {candidate.market_name}
                  </h3>
                  <p className="panel-caption">
                    {candidate.model_name} · {candidate.model_version}
                  </p>
                </div>
                <span className="admin-status">Candidate</span>
              </div>
              <div className="admin-metrics">
                <span>
                  Validated observations{" "}
                  <strong>{candidate.validated_observation_count ?? "Not recorded"}</strong>
                </span>
                <span>
                  Training rows <strong>{candidate.training_observation_count}</strong>
                </span>
                <span>
                  Training period{" "}
                  <strong>
                    {dateLabel(candidate.training_start)} – {dateLabel(candidate.training_end)}
                  </strong>
                </span>
                <span>
                  Horizon <strong>{candidate.horizon_days} days</strong>
                </span>
                <span>
                  Forecast points <strong>{candidate.points.length}</strong>
                </span>
              </div>
              <div className="admin-metrics">
                <span>
                  Baseline MAE <strong>{money(candidate.baseline_mae_paise_per_quintal)}</strong>
                </span>
                <span>
                  Model MAE <strong>{money(candidate.model_mae_paise_per_quintal)}</strong>
                </span>
                <span>
                  Baseline sMAPE <strong>{candidate.baseline_smape_percent ?? "—"}%</strong>
                </span>
                <span>
                  Model sMAPE <strong>{candidate.model_smape_percent ?? "—"}%</strong>
                </span>
              </div>
              {candidate.points.length > 0 ? (
                <div className="table-wrap">
                  <table className="produce-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Predicted</th>
                        <th scope="col">Lower</th>
                        <th scope="col">Upper</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidate.points.map((point) => (
                        <tr key={point.target_date}>
                          <td>{dateLabel(point.target_date)}</td>
                          <td>{money(point.predicted_modal_price_paise_per_quintal)}</td>
                          <td>{money(point.lower_bound_paise_per_quintal)}</td>
                          <td>{money(point.upper_bound_paise_per_quintal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="admin-notice">
                  No forecast points are attached. Do not approve this candidate.
                </p>
              )}
              <label className="admin-full-field">
                Human review note (minimum 20 characters)
                <textarea
                  value={notes[candidate.id] ?? ""}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [candidate.id]: event.target.value }))
                  }
                  rows={3}
                  minLength={20}
                  maxLength={1000}
                  placeholder="Record the source provenance, checks performed and reason for the decision."
                  required
                />
              </label>
              <div className="admin-review-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    busyId === candidate.id ||
                    candidate.points.length === 0 ||
                    (candidate.validated_observation_count ?? 0) < 120 ||
                    candidate.training_observation_count < 90
                  }
                  onClick={() => void reviewCandidate(candidate.id, "approved")}
                >
                  {busyId === candidate.id ? "Saving…" : "Approve for publication"}
                </button>
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={busyId === candidate.id}
                  onClick={() => void reviewCandidate(candidate.id, "rejected")}
                >
                  Reject candidate
                </button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
