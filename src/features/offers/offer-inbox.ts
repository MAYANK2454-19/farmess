export type OfferInboxStatus = "all" | "pending" | "accepted" | "declined" | "withdrawn" | "expired";
export type OfferInboxSort = "newest" | "oldest";

export type OfferInboxItem = {
  id: string;
  lot_id: string;
  quantity: number;
  unit: string;
  price_paise_per_quintal: number;
  valid_until: string;
  status: string;
  terms: string | null;
  created_at: string;
  lot: { id: string; crop: string; variety: string | null } | null;
  is_expired: boolean;
};

export type OfferInboxCounts = Record<OfferInboxStatus, number>;

export function effectiveOfferInboxStatus(offer: Pick<OfferInboxItem, "status" | "is_expired">) {
  return offer.status === "pending" && offer.is_expired ? "expired" : offer.status;
}

export function countOfferInboxStatuses(offers: readonly OfferInboxItem[]): OfferInboxCounts {
  const counts: OfferInboxCounts = {
    all: offers.length,
    pending: 0,
    accepted: 0,
    declined: 0,
    withdrawn: 0,
    expired: 0,
  };

  for (const offer of offers) {
    const status = effectiveOfferInboxStatus(offer);
    if (status in counts && status !== "all") {
      counts[status as Exclude<OfferInboxStatus, "all">] += 1;
    }
  }

  return counts;
}

export function filterOfferInbox(
  offers: readonly OfferInboxItem[],
  options: { status: OfferInboxStatus; query: string; sort: OfferInboxSort },
): OfferInboxItem[] {
  const terms = options.query.toLocaleLowerCase("en-IN").trim().split(/\\s+/).filter(Boolean);
  const filtered = offers.filter((offer) => {
    const status = effectiveOfferInboxStatus(offer);
    if (options.status !== "all" && status !== options.status) return false;

    const searchable = [
      offer.lot?.crop,
      offer.lot?.variety,
      offer.terms,
      String(offer.quantity),
      offer.unit,
      String(offer.price_paise_per_quintal),
      (offer.price_paise_per_quintal / 100).toFixed(2),
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("en-IN");

    return terms.every((term) => searchable.includes(term));
  });

  return filtered
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
