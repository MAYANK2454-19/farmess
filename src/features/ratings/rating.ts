/**
 * Ratings: after a sale is delivered or a transport/storage request is
 * completed, each side can rate the other once, from 1 to 5 stars. The
 * database enforces who may rate what (submit_rating); this file holds the
 * request parsing, the wording, and how a reputation feeds recommendations.
 */

export type RatingContext = "sale" | "service_request";

export type RatingSummary = {
  /** Mean of all stars received, 1-5, or null when nobody has rated yet. */
  average: number | null;
  count: number;
};

export const NO_RATINGS: RatingSummary = { average: null, count: 0 };

export type RatingRequest = {
  contextType: RatingContext;
  contextId: string;
  stars: number;
  comment: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_COMMENT_LENGTH = 300;

export function parseRatingRequest(
  body: unknown,
): { ok: true; value: RatingRequest } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send the rating as JSON." };
  }
  const fields = body as Record<string, unknown>;
  const allowed = ["contextType", "contextId", "stars", "comment"];
  if (Object.keys(fields).some((key) => !allowed.includes(key))) {
    return { ok: false, error: "The rating contains unsupported fields." };
  }
  if (fields.contextType !== "sale" && fields.contextType !== "service_request") {
    return { ok: false, error: "Choose a sale or a service request to rate." };
  }
  if (typeof fields.contextId !== "string" || !UUID.test(fields.contextId)) {
    return { ok: false, error: "Choose a sale or a service request to rate." };
  }
  if (
    typeof fields.stars !== "number" ||
    !Number.isInteger(fields.stars) ||
    fields.stars < 1 ||
    fields.stars > 5
  ) {
    return { ok: false, error: "Choose a rating from 1 to 5 stars." };
  }
  let comment: string | null = null;
  if (fields.comment !== undefined && fields.comment !== null && fields.comment !== "") {
    if (typeof fields.comment !== "string") {
      return { ok: false, error: "The comment must be text." };
    }
    comment = fields.comment.trim() || null;
    if (comment && comment.length > MAX_COMMENT_LENGTH) {
      return { ok: false, error: `Keep the comment to ${MAX_COMMENT_LENGTH} characters or fewer.` };
    }
  }
  return {
    ok: true,
    value: {
      contextType: fields.contextType,
      contextId: fields.contextId,
      stars: fields.stars,
      comment,
    },
  };
}

/** Database rows give numerics as numbers or strings; make a clean summary. */
export function toRatingSummary(average: unknown, count: unknown): RatingSummary {
  const total = Number(count);
  const mean = average === null || average === undefined ? Number.NaN : Number(average);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(mean)) return NO_RATINGS;
  return {
    average: Math.min(5, Math.max(1, Math.round(mean * 100) / 100)),
    count: Math.round(total),
  };
}

export function formatRating(summary: RatingSummary | null | undefined): string {
  if (!summary || summary.count <= 0 || summary.average === null) return "No ratings yet";
  return `${summary.average.toFixed(1)} out of 5 (${summary.count} rating${summary.count === 1 ? "" : "s"})`;
}

/** A rating of 3.5 is treated as neither good nor bad. */
const NEUTRAL_STARS = 3.5;
/** Ratings needed before a reputation counts in full. */
export const FULL_WEIGHT_RATINGS = 3;
/** Most points a reputation can add to or take from a recommendation score. */
export const MAX_REPUTATION_POINTS = 5;

/**
 * Points added to a recommendation score for a provider's reputation, from
 * -5 to +5. Someone with no ratings gets 0, so new providers are not held
 * back, and one or two ratings count only partly so a single review cannot
 * swing the ranking.
 */
export function reputationPoints(summary: RatingSummary | null | undefined): number {
  if (!summary || summary.count <= 0 || summary.average === null) return 0;
  const weight = Math.min(1, summary.count / FULL_WEIGHT_RATINGS);
  const lean = Math.max(-1, Math.min(1, (summary.average - NEUTRAL_STARS) / (5 - NEUTRAL_STARS)));
  return Math.round(lean * MAX_REPUTATION_POINTS * weight * 10) / 10;
}
