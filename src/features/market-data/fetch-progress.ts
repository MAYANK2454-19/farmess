/**
 * What the price-trend panel tells a person about the automatic price fetch,
 * and when it asks the server again. Kept apart from the component so the
 * rules can be tested: the panel must never say "fetching" when nothing is
 * being fetched, and must stop asking once there is nothing left to wait for.
 */

/** What the latest fetch for one area did, as far as the server knows. */
export type FetchRun = {
  state:
    "running" | "complete" | "partial" | "rate_limited" | "source_error" | "no_data" | "save_error";
  /** Rows saved by that fetch so far. */
  saved: number;
  /** Seconds until the server may try again (0 while running). */
  retryInSeconds: number;
  /** True while data.gov.in has asked Farmess to slow down. */
  slowedDown: boolean;
};

/** Answer of POST /api/market-history/ensure. */
export type FetchStatus = {
  configured: boolean;
  crop: string;
  state: string | null;
  district: string | null;
  scope: "district" | "state" | null;
  savedReports: number;
  newestDate: string | null;
  oldestDate: string | null;
  needed: boolean;
  reason: string;
  started: boolean;
  weatherStarted?: boolean;
  sourceDistrict?: string | null;
  runs?: { district: FetchRun | null; state: FetchRun | null };
};

/**
 * fetching: a fetch is running. retrying: the last one stopped early and the
 * server tries again shortly. waiting: nothing is known, but a fetch may be
 * running elsewhere. none: the source has nothing for this crop here.
 * paused: no more is fetched while this page stays open. done: nothing missing.
 */
export type FetchPhase = "fetching" | "retrying" | "waiting" | "none" | "paused" | "done";

export type FetchView = {
  phase: FetchPhase;
  /** Whole sentences for the notice above the chart. */
  lines: string[];
  /** True while Farmess is still working on it by itself. */
  busy: boolean;
  /** Milliseconds until the server is asked again; null to stop asking. */
  nextCheckMs: number | null;
};

export type FetchClock = {
  /** Milliseconds since this panel first asked. */
  sinceBeganMs: number;
  /** Milliseconds since the server last said it started a fetch for this panel; null if never. */
  sinceStartedMs: number | null;
};

/** One background fetch runs for at most about five minutes. */
const ACTIVE_WINDOW_MS = 6 * 60_000;
/** How long to keep looking when another person's fetch may be running. */
const WAIT_WINDOW_MS = 3 * 60_000;
/** After this long the page stops asking; the fetch carries on the next time it is opened. */
const GIVE_UP_MS = 20 * 60_000;
const QUICK_CHECK_MS = 5_000;
const CHECK_MS = 8_000;
const SLOW_CHECK_MS = 20_000;
const SLOWED_DOWN =
  "data.gov.in has asked Farmess to slow down, so this is taking longer than usual. Farmess keeps trying.";

export function fetchView(status: FetchStatus, clock: FetchClock): FetchView {
  const stop = (phase: FetchPhase, lines: string[] = []): FetchView => ({
    phase,
    lines,
    busy: false,
    nextCheckMs: null,
  });
  if (!status.needed) return stop("done");
  if (!status.configured) return stop("paused");

  const crop = status.crop;
  const state = status.state ?? "the state";
  const district = status.district;
  const saved = status.savedReports;
  /** The area the saved count belongs to. */
  const savedPlace = status.scope === "state" || !district ? state : district;
  const pausedLines =
    saved > 0
      ? [
          `${saved} reports for ${crop} in ${savedPlace} are saved. data.gov.in limits how much can be fetched at once, so the rest is fetched automatically the next time this page is opened.`,
        ]
      : [];
  if (clock.sinceBeganMs > GIVE_UP_MS) return stop("paused", pausedLines);

  const districtRun = status.runs?.district ?? null;
  const stateRun = status.runs?.state ?? null;
  const firstLine = (place: string) =>
    `Fetching ${crop} prices for ${place} from data.gov.in. This usually takes a minute or two; the page updates by itself.`;
  const moreLine = (place: string, count: number) =>
    `Fetching more ${crop} prices for ${place} from data.gov.in in the background (${count} reports saved so far). This page updates by itself.`;

  // A fetch is running on this server.
  if (districtRun?.state === "running" || stateRun?.state === "running") {
    const forDistrict = districtRun?.state === "running";
    const run = forDistrict ? districtRun : stateRun;
    // The count on the page may belong to the state while the district is fetched.
    const count = forDistrict && status.scope !== "district" ? 0 : saved;
    const place = forDistrict && district ? district : state;
    const lines = [
      count > 0
        ? moreLine(place, count)
        : !forDistrict && district
          ? `data.gov.in lists no mandi in ${district} district for ${crop}, so prices from the rest of ${state} are being fetched. This page updates by itself.`
          : firstLine(place),
    ];
    if (run?.slowedDown) lines.push(SLOWED_DOWN);
    return {
      phase: "fetching",
      lines,
      busy: true,
      nextCheckMs: count > 0 ? CHECK_MS : QUICK_CHECK_MS,
    };
  }

  // What the last attempt did. A district with no mandi hands over to the state.
  const districtEmpty = districtRun?.state === "no_data";
  const last = districtRun && !districtEmpty ? districtRun : stateRun;
  if (last) {
    const minutes = Math.max(1, Math.ceil(last.retryInSeconds / 60));
    const retry = (line: string): FetchView => ({
      phase: "retrying",
      lines: [line],
      busy: true,
      nextCheckMs: Math.min(
        SLOW_CHECK_MS,
        Math.max(QUICK_CHECK_MS, last.retryInSeconds * 1000 + 1_500),
      ),
    });
    switch (last.state) {
      case "complete":
        return stop("done");
      case "no_data":
        return stop("none", [
          `data.gov.in has no reports for ${crop} in ${state} in the last four months.`,
        ]);
      case "rate_limited":
        return retry(
          `data.gov.in is limiting requests right now, so nothing more could be fetched for the moment. Farmess tries again in about ${minutes} min; you can keep this page open.`,
        );
      case "source_error":
        return retry(
          `data.gov.in could not be reached. Farmess tries again in about ${minutes} min; you can keep this page open.`,
        );
      case "save_error":
        return retry(
          `The fetched prices could not be saved just now. Farmess tries again in about ${minutes} min.`,
        );
      case "partial":
        return retry(
          `${saved} reports for ${crop} are saved so far. data.gov.in limits how much can be read at once, so Farmess carries on in about ${minutes} min.`,
        );
    }
  }

  // Nothing is known about a fetch here: this request may have started one on
  // another server, or someone else's may be running.
  const fetching = clock.sinceStartedMs !== null && clock.sinceStartedMs < ACTIVE_WINDOW_MS;
  const waiting = clock.sinceBeganMs < WAIT_WINDOW_MS;
  if (fetching || waiting) {
    const lines = [
      districtEmpty && district
        ? `data.gov.in lists no mandi in ${district} district for ${crop}. Checking the rest of ${state}; this page updates by itself.`
        : saved > 0
          ? moreLine(savedPlace, saved)
          : firstLine(district ?? state),
    ];
    return {
      phase: fetching ? "fetching" : "waiting",
      lines,
      busy: true,
      nextCheckMs: saved > 0 ? CHECK_MS : QUICK_CHECK_MS,
    };
  }
  return stop("paused", pausedLines);
}
