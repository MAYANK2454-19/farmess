/**
 * Finds the maximum precipitation probability among the next six hourly
 * slots at or after `currentTime`. Returns null when no future slot matches.
 */
export function nextSixHourMaxPrecipitationProbability(
  times: readonly unknown[],
  probabilities: readonly unknown[],
  currentTime: string,
): number | null {
  const startIndex = times.findIndex((value) => typeof value === "string" && value >= currentTime);
  if (startIndex < 0) return null;

  const readings = probabilities
    .slice(startIndex, startIndex + 6)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100,
    );

  return readings.length > 0 ? Math.max(...readings) : null;
}

export const OPEN_METEO_PUBLIC_ENDPOINT = "https://api.open-meteo.com/v1/forecast";
export const OPEN_METEO_CUSTOMER_ENDPOINT = "https://customer-api.open-meteo.com/v1/forecast";

/**
 * Chooses the Open-Meteo endpoint, or null when weather must stay disabled.
 *
 * The public endpoint is free for non-commercial use only. On Vercel production
 * it requires either a paid customer key or an explicit owner declaration that
 * the deployment is non-commercial. Outside production the public endpoint is
 * used for evaluation. A customer key always takes priority.
 */
export function resolveOpenMeteoEndpoint(options: {
  customerKey: string | undefined;
  isVercelProduction: boolean;
  nonCommercialUseDeclared: boolean;
}): string | null {
  if (options.customerKey) return OPEN_METEO_CUSTOMER_ENDPOINT;
  if (options.isVercelProduction && !options.nonCommercialUseDeclared) return null;
  return OPEN_METEO_PUBLIC_ENDPOINT;
}
