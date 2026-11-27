import type { SupabaseClient } from "@supabase/supabase-js";
import { NO_RATINGS, toRatingSummary, type RatingSummary } from "@/features/ratings/rating";
import type { Database } from "@/lib/supabase/database.types";

/*
 * Reputation look-ups for API routes. Only averages and counts leave the
 * database (through functions); who rated whom stays private to the two people.
 */

type Db = SupabaseClient<Database>;

const unique = (ids: readonly (string | null | undefined)[]) => [
  ...new Set(ids.filter((id): id is string => Boolean(id))),
];

/** Reputation of people by user id. Ids with no ratings are simply absent. */
export async function ratingsByUser(
  db: Db,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, RatingSummary>> {
  const ids = unique(userIds);
  if (ids.length === 0) return new Map();
  const { data } = await db.rpc("user_rating_summaries", { p_user_ids: ids });
  return new Map(
    (data ?? []).map((row) => [row.user_id, toRatingSummary(row.average, row.rating_count)]),
  );
}

/** Reputation of the provider behind each service listing, by listing id. */
export async function ratingsByListing(
  db: Db,
  listingIds: readonly (string | null | undefined)[],
): Promise<Map<string, RatingSummary>> {
  const ids = unique(listingIds);
  if (ids.length === 0) return new Map();
  const { data } = await db.rpc("listing_provider_ratings", { p_listing_ids: ids });
  return new Map(
    (data ?? []).map((row) => [row.listing_id, toRatingSummary(row.average, row.rating_count)]),
  );
}

/** Reputation of the farmer behind each published lot, by lot id (the farmer stays unnamed). */
export async function ratingsByLot(
  db: Db,
  lotIds: readonly (string | null | undefined)[],
): Promise<Map<string, RatingSummary>> {
  const ids = unique(lotIds);
  if (ids.length === 0) return new Map();
  const { data } = await db.rpc("lot_owner_ratings", { p_lot_ids: ids });
  return new Map(
    (data ?? []).map((row) => [row.lot_id, toRatingSummary(row.average, row.rating_count)]),
  );
}

export type ExchangedStars = { mine: number | null; theirs: number | null };

/**
 * Stars exchanged on the given sales or service requests: what the signed-in
 * person gave and what they received. Row-level security already limits the
 * ratings table to rows where they are the rater or the person rated.
 */
export async function exchangedStars(
  db: Db,
  userId: string,
  contextType: "sale" | "service_request",
  contextIds: readonly string[],
): Promise<Map<string, ExchangedStars>> {
  const ids = unique(contextIds);
  const result = new Map<string, ExchangedStars>();
  if (ids.length === 0) return result;
  const { data } = await db
    .from("ratings")
    .select("context_id,rater_id,stars")
    .eq("context_type", contextType)
    .in("context_id", ids);
  for (const row of data ?? []) {
    const entry = result.get(row.context_id) ?? { mine: null, theirs: null };
    if (row.rater_id === userId) entry.mine = row.stars;
    else entry.theirs = row.stars;
    result.set(row.context_id, entry);
  }
  return result;
}

export const ratingOrNone = (map: Map<string, RatingSummary>, id: string | null | undefined) =>
  (id ? map.get(id) : undefined) ?? NO_RATINGS;
