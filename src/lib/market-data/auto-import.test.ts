import assert from "node:assert/strict";
import test from "node:test";

import {
  assessImportNeed,
  historyDaysFor,
  importSeriesKey,
  isoDaysBefore,
  outcomeFor,
  retrySecondsFor,
  runAutoImport,
  splitCompleteDates,
  type IngestRow,
} from "./auto-import.ts";

function row(date: string, modal: string, variety = "Local") {
  return {
    Arrival_Date: date,
    Commodity: "Tomato",
    State: "Jammu and Kashmir",
    District: "Jammu",
    Market: "Narwal Jammu",
    Variety: variety,
    Grade: "FAQ",
    Min_Price: "800",
    Max_Price: "3000",
    Modal_Price: modal,
  };
}

function source(list: unknown[][], limit: number, total = 999) {
  const calls: URL[] = [];
  let i = 0;
  const fetchPage = async (url: URL) => {
    calls.push(url);
    const records = list[i] ?? [];
    i += 1;
    return new Response(JSON.stringify({ limit, total, records }), { status: 200 });
  };
  return { calls, fetchPage };
}

const noSleep = async () => {};
const scope = { crop: "Tomato", state: "Jammu and Kashmir", district: "Jammu" };
const empty = { savedCount: 0, newestDate: null, oldestDate: null };

test("one claim key per crop and area, regardless of letter case or spacing", () => {
  assert.equal(importSeriesKey(scope), "tomato|jammu and kashmir|jammu");
  assert.equal(
    importSeriesKey({ crop: " TOMATO ", state: "Jammu  and Kashmir", district: null }),
    "tomato|jammu and kashmir|*",
  );
  assert.equal(historyDaysFor(scope), 365);
  assert.equal(historyDaysFor({ ...scope, district: null }), 120);
});

test("what is missing is judged from the saved dates", () => {
  const today = "2026-11-27";
  assert.equal(isoDaysBefore(today, 2), "2026-11-25");
  assert.deepEqual(assessImportNeed(empty, today, 365), { needed: true, reason: "nothing_saved" });
  assert.deepEqual(
    assessImportNeed(
      { savedCount: 50, newestDate: "2026-11-20", oldestDate: "2025-11-28" },
      today,
      365,
    ),
    { needed: true, reason: "newer_days" },
  );
  assert.deepEqual(
    assessImportNeed(
      { savedCount: 50, newestDate: "2026-11-26", oldestDate: "2026-06-01" },
      today,
      365,
    ),
    { needed: true, reason: "older_days" },
  );
  assert.deepEqual(
    assessImportNeed(
      { savedCount: 300, newestDate: "2026-11-25", oldestDate: "2025-12-05" },
      today,
      365,
    ),
    { needed: false, reason: "up_to_date" },
  );
});

test("outcomes decide how soon the same crop and area may be fetched again", () => {
  const base = { saved: 10, savedBefore: 0, saveFailed: false };
  assert.equal(outcomeFor({ ...base, stopReason: "reached_start_date" }), "complete");
  assert.equal(outcomeFor({ ...base, stopReason: "time_limit" }), "partial");
  assert.equal(outcomeFor({ ...base, stopReason: "rate_limited" }), "rate_limited");
  assert.equal(outcomeFor({ ...base, stopReason: "source_error" }), "source_error");
  assert.equal(outcomeFor({ ...base, saved: 0, stopReason: "no_more_records" }), "no_data");
  assert.equal(
    outcomeFor({ saved: 0, savedBefore: 40, saveFailed: false, stopReason: "no_more_records" }),
    "complete",
  );
  assert.equal(
    outcomeFor({ ...base, saveFailed: true, stopReason: "reached_start_date" }),
    "save_error",
  );
  assert.ok(retrySecondsFor("partial") < retrySecondsFor("rate_limited"));
  assert.ok(retrySecondsFor("rate_limited") < retrySecondsFor("complete"));
  assert.ok(retrySecondsFor("complete") < retrySecondsFor("no_data"));
});

test("rows of the oldest date in a batch are held back for the next page", () => {
  const records = [
    { arrival_date: "25/11/2026", n: 1 },
    { arrival_date: "24/11/2026", n: 2 },
    { arrival_date: "24/11/2026", n: 3 },
  ];
  const { complete, pending } = splitCompleteDates(records);
  assert.deepEqual(
    complete.map((r) => r.n),
    [1],
  );
  assert.deepEqual(
    pending.map((r) => r.n),
    [2, 3],
  );
});

test("a first import saves validated rows and reports completion", async () => {
  const { fetchPage, calls } = source(
    [
      [row("26/11/2026", "2000"), row("25/11/2026", "1900")],
      [row("24/11/2026", "1800"), row("20/11/2025", "900")],
    ],
    2,
  );
  const batches: { rows: IngestRow[]; received: number; note: string | null }[] = [];
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows, received, note) => {
      batches.push({ rows, received, note });
      return rows.length;
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(result.outcome, "complete");
  assert.equal(result.saved, 3);
  assert.equal(result.received, 3);
  assert.equal(result.sourceTotal, 999);
  assert.equal(calls[0].searchParams.get("filters[District]"), "Jammu");
  const all = batches.flatMap((batch) => batch.rows);
  assert.deepEqual(
    all.map((r) => [r.observation_date, r.modal_price_paise_per_quintal]),
    [
      ["2026-11-26", 200000],
      ["2026-11-25", 190000],
      ["2026-11-24", 180000],
    ],
  );
  assert.ok(!("source_url" in all[0]), "only the fields the database function reads are sent");
});

test("conflicting prices for the same mandi, variety and day are withheld even across pages", async () => {
  const { fetchPage } = source(
    [
      [row("26/11/2026", "2000"), row("25/11/2026", "1900")],
      [row("25/11/2026", "1700"), row("24/11/2026", "1800")],
      [],
    ],
    2,
  );
  const saved: IngestRow[] = [];
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows) => {
      saved.push(...rows);
      return rows.length;
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(result.conflictingKeysWithheld, 1);
  assert.deepEqual(saved.map((r) => r.observation_date).sort(), ["2026-11-24", "2026-11-26"]);
});

test("a rate limit keeps what was saved and asks to retry later", async () => {
  let n = 0;
  const fetchPage = async () => {
    n += 1;
    if (n === 1) {
      return new Response(
        JSON.stringify({ limit: 1, total: 50, records: [row("26/11/2026", "2000")] }),
      );
    }
    return new Response("slow down", { status: 429 });
  };
  let saved = 0;
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows) => {
      saved += rows.length;
      return rows.length;
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(result.outcome, "rate_limited");
  assert.equal(saved, 1);
  assert.match(result.note ?? "", /rate limit/i);
});

test("the newest rows are saved before the rest of the history is read", async () => {
  // Twenty report days a page, newest first, as a small key would return them.
  const day = (n: number) => {
    const date = new Date(Date.UTC(2026, 10, 26) - n * 86_400_000).toISOString().slice(0, 10);
    return `${date.slice(8)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  };
  const page = (from: number) => Array.from({ length: 20 }, (_, i) => row(day(from + i), "2000"));
  const { fetchPage: read } = source([page(0), page(20), page(40), []], 20);
  const events: string[] = [];
  const progress: number[] = [];
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows) => {
      events.push(`save ${rows.length}`);
      return rows.length;
    },
    onProgress: ({ saved }) => progress.push(saved),
    deps: {
      fetchPage: async (url) => {
        events.push("read");
        return read(url);
      },
      sleep: noSleep,
    },
  });
  // After two pages there is enough to show; the oldest day waits for the next page.
  assert.deepEqual(events, ["read", "read", "save 39", "read", "read", "save 21"]);
  assert.equal(result.saved, 60);
  assert.equal(result.outcome, "complete");
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 60);
});

test("each wait asked for by the source is passed on", async () => {
  let n = 0;
  const fetchPage = async () => {
    n += 1;
    return n === 1
      ? new Response("slow down", { status: 429 })
      : new Response(JSON.stringify({ limit: 10, total: 0, records: [] }));
  };
  let slowed = 0;
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows) => rows.length,
    onRateLimit: () => {
      slowed += 1;
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(slowed, 1);
  assert.equal(result.outcome, "no_data");
});

test("no rows at the source is reported as no data, with an audit entry", async () => {
  const { fetchPage } = source([[]], 10, 0);
  const audits: number[] = [];
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows, received) => {
      audits.push(received);
      return rows.length;
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(result.outcome, "no_data");
  assert.equal(result.sourceTotal, 0);
  assert.deepEqual(audits, [0]);
});

test("a database failure stops saving and is reported", async () => {
  const { fetchPage } = source([[row("26/11/2026", "2000")], []], 1);
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: empty,
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async () => {
      throw new Error("database unavailable");
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(result.outcome, "save_error");
  assert.equal(result.saved, 0);
});

test("a later run tops up newer days, then continues past the rows already saved", async () => {
  const { fetchPage, calls } = source(
    [
      // top-up: newer than the newest saved day, then reaches it
      [row("26/11/2026", "2100"), row("20/11/2026", "2000")],
      [row("19/11/2026", "1900")],
      // continuation from the saved-row offset
      [row("01/06/2026", "1500")],
      [],
    ],
    2,
  );
  const saved: IngestRow[] = [];
  const result = await runAutoImport({
    apiKey: "k",
    scope,
    coverage: { savedCount: 40, newestDate: "2026-11-20", oldestDate: "2026-07-01" },
    today: "2026-11-27",
    deadline: Number.MAX_SAFE_INTEGER,
    ingest: async (rows) => {
      saved.push(...rows);
      return rows.length;
    },
    deps: { fetchPage, sleep: noSleep },
  });
  assert.equal(result.outcome, "complete");
  // 40 saved rows + 1 newer row -> the continuation starts at source row 41.
  assert.equal(calls[2].searchParams.get("offset"), "41");
  assert.ok(saved.some((r) => r.observation_date === "2026-06-01"));
});
