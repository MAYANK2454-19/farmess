/*
 * Structured server logging for Farmess.
 *
 * One JSON object per line so Vercel's log viewer (and any drain) can filter
 * by field. Logs never include request bodies, cookies, tokens, emails or
 * phone numbers — only operational metadata.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, string | number | boolean | null | undefined>;

const SENSITIVE_KEY = /pass|secret|token|key|cookie|authorization|email|phone/i;

/** Drops sensitive or non-scalar fields so a log line can never leak credentials. */
export function sanitizeLogFields(fields: LogFields): LogFields {
  const safe: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (value === undefined) continue;
    safe[key] = typeof value === "string" && value.length > 300 ? value.slice(0, 300) : value;
  }
  return safe;
}

export function formatLogLine(level: LogLevel, event: string, fields: LogFields = {}): string {
  return JSON.stringify({
    time: new Date().toISOString(),
    level,
    event,
    ...sanitizeLogFields(fields),
  });
}

export function logEvent(level: LogLevel, event: string, fields: LogFields = {}): void {
  const line = formatLogLine(level, event, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/**
 * Wraps a Next.js route handler: logs method, route, status and duration for
 * every call, adds Server-Timing and X-Request-Id headers, and logs then
 * rethrows unexpected errors so Next.js still returns its standard 500.
 */
export function withApiLogging<Args extends unknown[]>(
  route: string,
  method: string,
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    const requestId = newRequestId();
    const started = performance.now();

    try {
      const response = await handler(...args);
      const durationMs = Math.round(performance.now() - started);
      const level: LogLevel =
        response.status >= 500 ? "error" : response.status >= 400 ? "warn" : "info";

      logEvent(level, "api_request", {
        requestId,
        method,
        route,
        status: response.status,
        durationMs,
      });

      try {
        response.headers.set("Server-Timing", `app;dur=${durationMs}`);
        response.headers.set("X-Request-Id", requestId);
      } catch {
        // Some responses (e.g. Response.redirect) have immutable headers.
      }
      return response;
    } catch (error) {
      logEvent("error", "api_unhandled_error", {
        requestId,
        method,
        route,
        durationMs: Math.round(performance.now() - started),
        message: errorMessage(error),
      });
      throw error;
    }
  };
}
