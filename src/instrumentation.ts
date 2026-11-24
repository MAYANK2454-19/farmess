import { logEvent } from "@/lib/observability/logger";

export function register() {
  // No tracing SDK is configured; structured logs go to the Vercel runtime log.
}

/**
 * Next.js calls this for errors thrown while rendering pages, server components
 * and route handlers. Only operational metadata is logged (no bodies or cookies).
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  logEvent("error", "request_error", {
    method: request.method,
    path: request.path.split("?")[0],
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    message: error instanceof Error ? error.message : String(error),
    digest:
      typeof error === "object" && error !== null && "digest" in error
        ? String((error as { digest: unknown }).digest)
        : undefined,
  });
}
