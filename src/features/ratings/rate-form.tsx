"use client";

import { useId, useState, type FormEvent } from "react";
import { MAX_COMMENT_LENGTH, type RatingContext } from "./rating";

const WORDS = ["", "Poor", "Below average", "Okay", "Good", "Excellent"];

/**
 * One rating per completed sale or service request. The server checks that the
 * person took part and that the work is completed; a second rating is refused.
 */
export function RateForm({
  contextType,
  contextId,
  who,
  onRated,
}: {
  contextType: RatingContext;
  contextId: string;
  /** Who is being rated, e.g. "the buyer" or "this provider". */
  who: string;
  onRated: (stars: number) => void;
}) {
  const id = useId();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stars < 1) {
      setError("Choose 1 to 5 stars first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ contextType, contextId, stars, comment: comment.trim() || null }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Your rating could not be saved.");
      onRated(stars);
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Your rating could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="rate-form" onSubmit={submit}>
      <fieldset className="star-input">
        <legend>Rate {who}</legend>
        <div className="star-input-row">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className={value <= stars ? "star star-on" : "star"}>
              <input
                type="radio"
                name={`${id}-stars`}
                value={value}
                checked={stars === value}
                onChange={() => setStars(value)}
              />
              <span aria-hidden="true">★</span>
              <span className="sr-only">
                {value} star{value === 1 ? "" : "s"}: {WORDS[value]}
              </span>
            </label>
          ))}
          <span className="star-word" aria-hidden="true">
            {WORDS[stars]}
          </span>
        </div>
      </fieldset>
      <label className="form-field" htmlFor={`${id}-comment`}>
        <span className="form-label">Comment (optional)</span>
        <textarea
          id={`${id}-comment`}
          className="form-control"
          rows={2}
          maxLength={MAX_COMMENT_LENGTH}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What went well, or what could be better?"
        />
      </label>
      {error ? (
        <p className="form-alert" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? "Saving…" : "Submit rating"}
        </button>
      </div>
      <p className="form-help">
        A rating cannot be changed afterwards. It is shown to others only as part of an average.
      </p>
    </form>
  );
}
