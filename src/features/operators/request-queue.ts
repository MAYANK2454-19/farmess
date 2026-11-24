export type OperatorRequestQueueStatus = "all" | "pending" | "accepted" | "closed";
export type OperatorRequestQueueSort = "newest" | "oldest";

export type OperatorRequestQueueItem = {
  status: string;
  listing?: { title?: string | null; service_type?: string | null } | null;
  origin_area?: string | null;
  destination_area?: string | null;
  requested_date?: string | null;
  requested_quantity?: number | null;
  unit?: string | null;
  message?: string | null;
  created_at: string;
};

export type OperatorRequestQueueFilters = {
  status: OperatorRequestQueueStatus;
  query: string;
  sort: OperatorRequestQueueSort;
};

export type OperatorRequestQueueCounts = {
  all: number;
  pending: number;
  accepted: number;
  closed: number;
};

function searchableText(request: OperatorRequestQueueItem): string {
  return [
    request.listing?.title,
    request.listing?.service_type,
    request.status,
    request.origin_area,
    request.destination_area,
    request.requested_date,
    request.requested_quantity === null || request.requested_quantity === undefined
      ? null
      : String(request.requested_quantity),
    request.unit,
    request.message,
  ]
    .filter(
      (value): value is string | number => typeof value === "string" || typeof value === "number",
    )
    .join(" ")
    .normalize("NFKD")
    .toLocaleLowerCase("en-IN");
}

function matchesStatus(status: string, filter: OperatorRequestQueueStatus): boolean {
  if (filter === "all") return true;
  if (filter === "pending" || filter === "accepted") return status === filter;
  return status === "declined" || status === "cancelled" || status === "completed";
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function countOperatorRequests(
  requests: readonly OperatorRequestQueueItem[],
): OperatorRequestQueueCounts {
  return requests.reduce<OperatorRequestQueueCounts>(
    (counts, request) => {
      counts.all += 1;
      if (request.status === "pending") counts.pending += 1;
      else if (request.status === "accepted") counts.accepted += 1;
      else if (matchesStatus(request.status, "closed")) counts.closed += 1;
      return counts;
    },
    { all: 0, pending: 0, accepted: 0, closed: 0 },
  );
}

/** Filter and sort a provider's already-authorized request rows without mutating the source array. */
export function filterOperatorRequests<T extends OperatorRequestQueueItem>(
  requests: readonly T[],
  filters: OperatorRequestQueueFilters,
): T[] {
  const terms = filters.query
    .trim()
    .normalize("NFKD")
    .toLocaleLowerCase("en-IN")
    .split(/\s+/)
    .filter(Boolean);

  return requests
    .map((request, index) => ({ request, index, createdAt: timestamp(request.created_at) }))
    .filter(({ request }) => matchesStatus(request.status, filters.status))
    .filter(({ request }) => {
      if (terms.length === 0) return true;
      const haystack = searchableText(request);
      return terms.every((term) => haystack.includes(term));
    })
    .sort((left, right) => {
      if (left.createdAt === null && right.createdAt !== null) return 1;
      if (left.createdAt !== null && right.createdAt === null) return -1;
      if (left.createdAt !== null && right.createdAt !== null) {
        const difference = left.createdAt - right.createdAt;
        if (difference !== 0) return filters.sort === "newest" ? -difference : difference;
      }
      return left.index - right.index;
    })
    .map(({ request }) => request);
}
