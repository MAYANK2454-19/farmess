"use client";

import { useState, type FormEvent } from "react";
import type { NearbyServiceCandidate } from "@/features/logistics/recommendations";

export function LogisticsFeedbackForm({
  listing,
  rankPosition,
  roadRoute,
}: {
  listing: NearbyServiceCandidate;
  rankPosition: number;
  roadRoute?: { distanceMeters: number; durationSeconds: number } | null;
}) {
  const [rating, setRating] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!rating) {
      setError("Choose a rating from 1 to 5.");
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/logistics/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          service_listing_id: listing.id,
          rank_position: rankPosition,
          distance_meters: listing.distance_meters,
          capacity_match: listing.capacity_match,
          crop_match: listing.crop_match,
          date_match: listing.date_match,
          cold_chain_match: listing.cold_chain_match,
          service_radius_match: listing.service_radius_match,
          road_distance_meters: roadRoute?.distanceMeters ?? null,
          drive_duration_seconds: roadRoute?.durationSeconds ?? null,
          user_feedback: Number(rating),
          feedback_note: note.trim() || null,
        }),
      });

      const result = (await response.json()) as { feedback?: { id: string }; error?: string };
      if (!response.ok || !result.feedback) {
        throw new Error(result.error ?? "Feedback could not be saved.");
      }

      setSaved(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Feedback could not be saved.");
    } finally {
      setPending(false);
    }
  }

  if (saved) {
    return (
      <p className="form-success logistics-feedback-saved" role="status">
        Thank you. Your feedback was saved separately from any booking or service outcome.
      </p>
    );
  }

  return (
    <details className="logistics-feedback">
      <summary>Was this recommendation useful?</summary>
      <form className="logistics-feedback-form" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">Your rating</span>
          <select
            className="form-control"
            value={rating}
            onChange={(event) => setRating(event.target.value)}
            required
          >
            <option value="">Choose a rating</option>
            <option value="1">1 — Not useful</option>
            <option value="2">2 — Slightly useful</option>
            <option value="3">3 — Acceptable</option>
            <option value="4">4 — Useful</option>
            <option value="5">5 — Very useful</option>
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">Optional note</span>
          <input
            className="form-control"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={300}
            placeholder="For example: wrong capacity, route not served, quote unavailable"
          />
        </label>
        {error ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button-secondary" type="submit" disabled={pending}>
          {pending ? "Saving…" : "Send feedback"}
        </button>
      </form>
    </details>
  );
}
