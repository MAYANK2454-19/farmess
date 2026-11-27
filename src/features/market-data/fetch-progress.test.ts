import assert from "node:assert/strict";
import test from "node:test";

import { fetchView, type FetchRun, type FetchStatus } from "./fetch-progress.ts";

const base: FetchStatus = {
  configured: true,
  crop: "Bitter gourd",
  state: "Bihar",
  district: "East Champaran",
  scope: "district",
  savedReports: 0,
  newestDate: null,
  oldestDate: null,
  needed: true,
  reason: "nothing_saved",
  started: false,
  runs: { district: null, state: null },
};
const run = (state: FetchRun["state"], extra: Partial<FetchRun> = {}): FetchRun => ({
  state,
  saved: 0,
  retryInSeconds: 0,
  slowedDown: false,
  ...extra,
});
const justNow = { sinceBeganMs: 1_000, sinceStartedMs: 1_000 };
const longAgo = { sinceBeganMs: 10 * 60_000, sinceStartedMs: null };

test("nothing missing, or no key on the server: nothing to say and no more checks", () => {
  const done = fetchView({ ...base, needed: false }, justNow);
  assert.deepEqual([done.phase, done.lines, done.nextCheckMs], ["done", [], null]);
  const unset = fetchView({ ...base, configured: false }, justNow);
  assert.deepEqual([unset.phase, unset.nextCheckMs], ["paused", null]);
});

test("a running fetch is described, and looked at again quickly until prices arrive", () => {
  const first = fetchView({ ...base, runs: { district: run("running"), state: null } }, justNow);
  assert.equal(first.phase, "fetching");
  assert.equal(first.busy, true);
  assert.equal(first.nextCheckMs, 5_000);
  assert.match(
    first.lines[0],
    /^Fetching Bitter gourd prices for East Champaran from data\.gov\.in/,
  );

  const more = fetchView(
    { ...base, savedReports: 40, runs: { district: run("running", { saved: 40 }), state: null } },
    justNow,
  );
  assert.equal(more.nextCheckMs, 8_000);
  assert.match(more.lines[0], /40 reports saved so far/);
});

test("a slow-down from the source is said in plain words", () => {
  const view = fetchView(
    { ...base, runs: { district: run("running", { slowedDown: true }), state: null } },
    justNow,
  );
  assert.equal(view.lines.length, 2);
  assert.match(view.lines[1], /asked Farmess to slow down/);
});

test("a district with no mandi hands over to the state", () => {
  const view = fetchView(
    { ...base, runs: { district: run("no_data"), state: run("running") } },
    justNow,
  );
  assert.equal(view.phase, "fetching");
  assert.match(view.lines[0], /lists no mandi in East Champaran district for Bitter gourd/);
  assert.match(view.lines[0], /rest of Bihar/);

  // The count on the page belongs to the state once its rows start to arrive.
  const later = fetchView(
    {
      ...base,
      scope: "state",
      savedReports: 25,
      runs: { district: run("no_data"), state: run("running", { saved: 25 }) },
    },
    justNow,
  );
  assert.match(later.lines[0], /^Fetching more Bitter gourd prices for Bihar .*25 reports saved/);
});

test("the state's saved count is not shown as the district's while the district is fetched", () => {
  const view = fetchView(
    { ...base, scope: "state", savedReports: 25, runs: { district: run("running"), state: null } },
    justNow,
  );
  assert.match(view.lines[0], /^Fetching Bitter gourd prices for East Champaran/);
  assert.equal(view.nextCheckMs, 5_000);
});

test("a rate limit is reported with the time of the next try, and checked less often", () => {
  const view = fetchView(
    {
      ...base,
      runs: { district: run("no_data"), state: run("rate_limited", { retryInSeconds: 150 }) },
    },
    longAgo,
  );
  assert.equal(view.phase, "retrying");
  assert.equal(view.busy, true);
  assert.equal(view.nextCheckMs, 20_000);
  assert.match(view.lines[0], /limiting requests/);
  assert.match(view.lines[0], /about 3 min/);

  const soon = fetchView(
    { ...base, runs: { district: run("rate_limited", { retryInSeconds: 2 }), state: null } },
    longAgo,
  );
  assert.equal(soon.nextCheckMs, 5_000);
  assert.match(soon.lines[0], /about 1 min/);
});

test("a fetch that stopped at its time limit says how far it got", () => {
  const view = fetchView(
    {
      ...base,
      savedReports: 310,
      runs: { district: run("partial", { saved: 310, retryInSeconds: 45 }), state: null },
    },
    longAgo,
  );
  assert.equal(view.phase, "retrying");
  assert.match(view.lines[0], /^310 reports for Bitter gourd are saved so far/);
});

test("nothing at the source for the whole state ends the waiting", () => {
  const view = fetchView(
    { ...base, runs: { district: run("no_data"), state: run("no_data") } },
    justNow,
  );
  assert.equal(view.phase, "none");
  assert.equal(view.busy, false);
  assert.equal(view.nextCheckMs, null);
  assert.match(view.lines[0], /no reports for Bitter gourd in Bihar/);
});

test("a finished fetch that could not reach further back is simply done", () => {
  const view = fetchView(
    { ...base, savedReports: 90, runs: { district: run("complete", { saved: 90 }), state: null } },
    justNow,
  );
  assert.deepEqual([view.phase, view.lines, view.nextCheckMs], ["done", [], null]);
});

test("without word from the server the page waits a few minutes, then stops", () => {
  const started = fetchView(base, { sinceBeganMs: 4 * 60_000, sinceStartedMs: 4 * 60_000 });
  assert.equal(started.phase, "fetching");
  const others = fetchView(base, { sinceBeganMs: 60_000, sinceStartedMs: null });
  assert.equal(others.phase, "waiting");
  assert.equal(others.busy, true);
  const stopped = fetchView(base, longAgo);
  assert.deepEqual([stopped.phase, stopped.lines, stopped.nextCheckMs], ["paused", [], null]);

  // A district the source did not list, with nothing known about the state yet.
  const handing = fetchView(
    { ...base, runs: { district: run("no_data"), state: null } },
    { sinceBeganMs: 20_000, sinceStartedMs: 20_000 },
  );
  assert.match(handing.lines[0], /Checking the rest of Bihar/);
});

test("the page never keeps asking for more than twenty minutes", () => {
  const view = fetchView(
    { ...base, savedReports: 12, runs: { district: run("running", { saved: 12 }), state: null } },
    { sinceBeganMs: 21 * 60_000, sinceStartedMs: 60_000 },
  );
  assert.equal(view.phase, "paused");
  assert.equal(view.nextCheckMs, null);
  assert.match(view.lines[0], /^12 reports for Bitter gourd in East Champaran are saved/);
});
