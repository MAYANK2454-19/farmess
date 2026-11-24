/**
 * Returns the maximum precipitation probability over the next six hourly slots
 * beginning at the first provider timestamp at or after the current observation.
 * Returns null rather than accidentally reporting the day's first hours when no
 * future hourly slot can be matched.
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
