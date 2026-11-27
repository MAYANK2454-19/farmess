import assert from "node:assert/strict";
import test from "node:test";

import { fetchOgdHistory, historyDateToIso, lowerCaseHistoryRecord } from "./ogd-history.ts";
import {
  reconcileMarketObservationHistory,
  type MarketObservationImportRow,
} from "./import-batch.ts";

function row(date: string, modal: string) {
  return {
    Arrival_Date: date,
    Commodity: "Tomato",
    State: "Maharashtra",
    District: "Pune",
    Market: "Pune(Manjri) ",
    Variety: "Local",
    Grade: "Local",
    Min_Price: "800",
    Max_Price: "1500",
    Modal_Price: modal,
  };
}

function pages(list: unknown[][], limit: number) {
  const calls: URL[] = [];
  let i = 0;
  const fetchPage = async (url: URL) => {
    calls.push(url);
    const records = list[i] ?? [];
    i += 1;
    return new Response(JSON.stringify({ limit, records }), { status: 200 });
  };
  return { calls, fetchPage };
}

const base = {
  apiKey: "k",
  commodity: "Tomato",
  state: "Maharashtra",
  maxRecords: 1000,
  deadline: Number.MAX_SAFE_INTEGER,
};
const noSleep = async () => {};

test("dates and keys from the history resource are normalised", () => {
  assert.equal(historyDateToIso("05/11/2026"), "2026-11-05");
  assert.equal(historyDateToIso("2026-11-05"), "2026-11-05");
  assert.equal(historyDateToIso("5/11/2026"), null);
  assert.deepEqual(lowerCaseHistoryRecord({ Market: "Pune(Manjri) ", Modal_Price: 1100 }), {
    market: "Pune(Manjri)",
    modal_price: 1100,
  });
});

test("walks pages newest-first (small key page size) and stops at the start date", async () => {
  const { calls, fetchPage } = pages(
    [
      [row("25/11/2026", "1100"), row("24/11/2026", "1050")],
      [row("23/11/2026", "1000"), row("20/11/2026", "990")],
    ],
    2,
  );
  const result = await fetchOgdHistory(
    { ...base, fromDate: "2026-11-21" },
    { fetchPage, sleep: noSleep },
  );
  assert.equal(result.stopReason, "reached_start_date");
  assert.equal(result.records.length, 3);
  assert.equal(result.oldestDate, "2026-11-23");
  assert.equal(result.newestDate, "2026-11-25");
  assert.equal(calls[0].searchParams.get("sort[Arrival_Date]"), "desc");
  assert.equal(calls[1].searchParams.get("offset"), "2");
  assert.equal(result.records[0].market, "Pune(Manjri)");
});

test("retries after HTTP 429, then keeps what it already fetched when still limited", async () => {
  let n = 0;
  const fetchPage = async () => {
    n += 1;
    if (n === 1)
      return new Response(JSON.stringify({ limit: 1, records: [row("25/11/2026", "1100")] }));
    return new Response("slow down", { status: 429 });
  };
  const result = await fetchOgdHistory(
    { ...base, fromDate: "2026-01-01" },
    { fetchPage, sleep: noSleep },
  );
  assert.equal(result.stopReason, "rate_limited");
  assert.equal(result.records.length, 1);
  assert.equal(n, 5);
});

test("the caller chooses how long to keep trying and hears about each wait", async () => {
  let n = 0;
  const fetchPage = async () => {
    n += 1;
    return n < 4
      ? new Response("slow down", { status: 429 })
      : new Response(JSON.stringify({ limit: 10, records: [] }));
  };
  const waits: number[] = [];
  const result = await fetchOgdHistory(
    {
      ...base,
      fromDate: "2026-01-01",
      rateLimitWaitsMs: [1, 2, 3, 4],
      onRateLimit: (ms) => waits.push(ms),
    },
    { fetchPage, sleep: noSleep },
  );
  assert.equal(result.stopReason, "no_more_records");
  assert.deepEqual(waits, [1, 2, 3]);
});

test("history reconcile drops only keys whose prices disagree", () => {
  const a: MarketObservationImportRow = {
    crop: "Tomato",
    variety: "Local",
    district: "Pune",
    state: "Maharashtra",
    market_name: "Pune",
    min_price_paise_per_quintal: 1,
    max_price_paise_per_quintal: 3,
    modal_price_paise_per_quintal: 2,
    observation_date: "2026-11-01",
    retrieved_at: "x",
    source_name: "s",
    source_url: "u",
  };
  const b = { ...a, observation_date: "2026-11-02" };
  const result = reconcileMarketObservationHistory([
    a,
    { ...a },
    b,
    { ...b, modal_price_paise_per_quintal: 3 },
  ]);
  assert.deepEqual(result, { rows: [a], duplicatesRemoved: 1, conflictingKeysWithheld: 1 });
});

test("a continued import starts from the given source offset", async () => {
  const { calls, fetchPage } = pages([[row("10/10/2026", "900")], []], 1);
  await fetchOgdHistory(
    { ...base, fromDate: "2026-01-01", startOffset: 250 },
    { fetchPage, sleep: noSleep },
  );
  assert.equal(calls[0].searchParams.get("offset"), "250");
  assert.equal(calls[1].searchParams.get("offset"), "251");
});
