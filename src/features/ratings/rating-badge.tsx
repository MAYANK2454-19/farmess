import { formatRating, type RatingSummary } from "./rating";

/**
 * Compact reputation: "★ 4.6 (12)", or "New" when nobody has rated yet.
 * The full sentence is available to screen readers and as a tooltip.
 */
export function RatingBadge({
  summary,
  label = "Rating",
}: {
  summary: RatingSummary | null | undefined;
  label?: string;
}) {
  const rated = Boolean(summary && summary.count > 0 && summary.average !== null);
  const text = `${label}: ${formatRating(summary)}`;
  return (
    <span className={rated ? "rating-badge" : "rating-badge rating-badge-new"} title={text}>
      <span aria-hidden="true">
        {rated ? `★ ${summary!.average!.toFixed(1)}` : "☆ New"}
        {rated ? <small> ({summary!.count})</small> : null}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
