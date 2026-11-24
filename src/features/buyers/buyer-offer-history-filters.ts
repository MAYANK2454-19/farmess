export type BuyerOfferHistoryStatus =
  "all" | "pending" | "accepted" | "declined" | "withdrawn" | "expired";

export type BuyerOfferHistorySort = "newest" | "oldest";

export type BuyerOfferHistoryItem = {
  id: string;
  quantity: number;
  unit: string;
  price_paise_per_quintal: number;
  valid_until: string;
  status: string;
  terms: string | null;
  created_at: string;
  is_expired: boolean;
};

export type BuyerOfferHistoryCounts = Record<BuyerOfferHistoryStatus, number>;

export function effectiveBuyerOfferStatus(
  offer: Pick<BuyerOfferHistoryItem, "status" | "is_expired">,
): string {
  return offer.status === "pending" && offer.is_expired ? "expired" : offer.status;
}

export function countBuyerOfferStatuses(
  offers: readonly BuyerOfferHistoryItem[],
): BuyerOfferHistoryCounts {
  const counts: BuyerOfferHistoryCounts = {
    all: offers.length,
    pending: 0,
    accepted: 0,
    declined: 0,
    withdrawn: 0,
    expired: 0,
  };

  for (const offer of offers) {
    const status = effectiveBuyerOfferStatus(offer);
    if (status !== "all" && status in counts) {
      counts[status as Exclude<BuyerOfferHistoryStatus, "all">] += 1;
    }
  }

  return counts;
}

export function filterBuyerOfferHistory(
  offers: readonly BuyerOfferHistoryItem[],
  options: {
    status: BuyerOfferHistoryStatus;
    query: string;
    sort: BuyerOfferHistorySort;
  },
): BuyerOfferHistoryItem[] {
  const terms = options.query.toLocaleLowerCase("en-IN").trim().split(/\s+/).filter(Boolean);

  return offers
    .filter((offer) => {
      const status = effectiveBuyerOfferStatus(offer);
      if (options.status !== "all" && status !== options.status) return false;

      const searchable = [
        offer.terms,
        String(offer.quantity),
        offer.unit,
        String(offer.price_paise_per_quintal),
        (offer.price_paise_per_quintal / 100).toFixed(2),
        offer.valid_until,
        offer.created_at,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("en-IN");

      return terms.every((term) => searchable.includes(term));
    })
    .map((offer, index) => ({ offer, index, timestamp: Date.parse(offer.created_at) }))
    .sort((left, right) => {
      const leftValid = Number.isFinite(left.timestamp);
      const rightValid = Number.isFinite(right.timestamp);
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      if (!leftValid || left.timestamp === right.timestamp) return left.index - right.index;
      const direction = options.sort === "newest" ? -1 : 1;
      return (left.timestamp - right.timestamp) * direction;
    })
    .map(({ offer }) => offer);
}
