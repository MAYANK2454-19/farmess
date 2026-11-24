/**
 * Finds the maximum precipitation probability among the next six hourly
 * slots at or after `currentTime`. Returns null when no future slot matches.
 */
export function nextSixHourMaxPrecipitationProbability(
  times: readonly unknown[],
  probabilities: readonly unknown[],
  currentTime: string,
): number | null {
  const startIndex = times.findIndex(
    (value) => typeof value === "string" && value >= currentTime,
  );
  if (startIndex < 0) return null;

  const readings = probabilities
    .slice(startIndex, startIndex + 6)
    .filter(
      (value): value is number =>
        typeof value === "number" &&
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 100,
    );

  return readings.length > 0 ? Math.max(...readings) : null;
}
