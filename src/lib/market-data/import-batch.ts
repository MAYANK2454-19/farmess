export type MarketObservationImportRow = {
  crop: string;
  variety: string | null;
  district: string;
  state: string;
  market_name: string;
  min_price_paise_per_quintal: number | null;
  max_price_paise_per_quintal: number | null;
  modal_price_paise_per_quintal: number | null;
  observation_date: string;
  retrieved_at: string;
  source_name: string;
  source_url: string;
};

export type MarketObservationBatchResult =
  | {
      status: "ready";
      rows: MarketObservationImportRow[];
      duplicatesRemoved: number;
    }
  | {
      status: "conflicting-duplicates";
      conflictCount: number;
    };

function naturalKey(row: MarketObservationImportRow): string {
  return JSON.stringify([
    row.crop,
    row.variety,
    row.state,
    row.district,
    row.market_name,
    row.observation_date,
    row.source_name,
  ]);
}

function comparablePayload(row: MarketObservationImportRow): string {
  return JSON.stringify([
    row.min_price_paise_per_quintal,
    row.max_price_paise_per_quintal,
    row.modal_price_paise_per_quintal,
    row.source_url,
  ]);
}

/**
 * Collapse equivalent source observations before a database
 * upsert. If one natural key carries different prices or provenance, reject
 * the whole batch rather than letting row order decide which value wins.
 */
export function reconcileMarketObservationBatch(
  rows: readonly MarketObservationImportRow[],
): MarketObservationBatchResult {
  const firstByKey = new Map<string, MarketObservationImportRow>();
  const payloadByKey = new Map<string, string>();
  const conflicts = new Set<string>();
  let duplicatesRemoved = 0;

  for (const row of rows) {
    const key = naturalKey(row);
    const payload = comparablePayload(row);
    const existingPayload = payloadByKey.get(key);

    if (existingPayload === undefined) {
      firstByKey.set(key, row);
      payloadByKey.set(key, payload);
      continue;
    }

    if (existingPayload !== payload) {
      conflicts.add(key);
      continue;
    }

    duplicatesRemoved += 1;
  }

  if (conflicts.size > 0) {
    return { status: "conflicting-duplicates", conflictCount: conflicts.size };
  }

  return {
    status: "ready",
    rows: [...firstByKey.values()],
    duplicatesRemoved,
  };
}

/**
 * History imports span many days and grades, so one natural key (which has no
 * grade) can legitimately carry two different prices. Rather than withholding
 * the whole batch, drop only the keys whose rows disagree and report how many.
 */
export function reconcileMarketObservationHistory(rows: readonly MarketObservationImportRow[]): {
  rows: MarketObservationImportRow[];
  duplicatesRemoved: number;
  conflictingKeysWithheld: number;
} {
  const firstByKey = new Map<string, MarketObservationImportRow>();
  const payloadByKey = new Map<string, string>();
  const conflicts = new Set<string>();
  let duplicatesRemoved = 0;

  for (const row of rows) {
    const key = naturalKey(row);
    const payload = comparablePayload(row);
    const existingPayload = payloadByKey.get(key);
    if (existingPayload === undefined) {
      firstByKey.set(key, row);
      payloadByKey.set(key, payload);
    } else if (existingPayload !== payload) {
      conflicts.add(key);
    } else {
      duplicatesRemoved += 1;
    }
  }

  for (const key of conflicts) firstByKey.delete(key);
  return {
    rows: [...firstByKey.values()],
    duplicatesRemoved,
    conflictingKeysWithheld: conflicts.size,
  };
}
