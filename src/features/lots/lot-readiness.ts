export type LotReadinessStatus = "expired" | "due_soon" | "upcoming" | "available";
export type LotReadinessInput = { id: string; crop: string; available_from: string; sell_by: string; status: string; };
export type LotReadiness = LotReadinessInput & { readiness: LotReadinessStatus; daysUntilSellBy: number; daysUntilAvailable: number; };
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
function toDayNumber(value: string): number | null {
  if (!DATE_PATTERN.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return Math.floor(timestamp / DAY_MS);
}
/** Calendar reminders only; this does not infer produce freshness, spoilage or food safety. */
export function buildLotReadiness(lots: LotReadinessInput[], today: string): LotReadiness[] {
  const todayNumber = toDayNumber(today);
  if (todayNumber === null) throw new Error("A valid local calendar date is required.");
  const priorities: Record<LotReadinessStatus, number> = { expired: 0, due_soon: 1, upcoming: 2, available: 3 };
  return lots.flatMap((lot) => {
    const availableNumber = toDayNumber(lot.available_from);
    const sellByNumber = toDayNumber(lot.sell_by);
    if (!lot.id.trim() || !lot.crop.trim() || availableNumber === null || sellByNumber === null || sellByNumber < availableNumber) return [];
    const daysUntilSellBy = sellByNumber - todayNumber;
    const daysUntilAvailable = availableNumber - todayNumber;
    let readiness: LotReadinessStatus;
    if (daysUntilSellBy < 0) readiness = "expired";
    else if (daysUntilAvailable > 0) readiness = "upcoming";
    else if (daysUntilSellBy <= 3) readiness = "due_soon";
    else readiness = "available";
    return [{ ...lot, readiness, daysUntilSellBy, daysUntilAvailable }];
  }).sort((a, b) => {
    const priorityDifference = priorities[a.readiness] - priorities[b.readiness];
    if (priorityDifference !== 0) return priorityDifference;
    if (a.daysUntilSellBy !== b.daysUntilSellBy) return a.daysUntilSellBy - b.daysUntilSellBy;
    return a.crop.localeCompare(b.crop);
  });
}
