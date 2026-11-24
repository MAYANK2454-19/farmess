import Link from "next/link";
import styles from "./lot-readiness-panel.module.css";
import {
  buildLotReadiness,
  type LotReadinessInput,
  type LotReadinessStatus,
} from "./lot-readiness";
const STATUS_LABELS: Record<LotReadinessStatus, string> = {
  expired: "Sell-by date passed",
  due_soon: "Sell-by approaching",
  upcoming: "Not available yet",
  available: "Within selling window",
};
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}
function getGuidance(lot: ReturnType<typeof buildLotReadiness>[number]) {
  if (lot.readiness === "expired")
    return "Review this lot and its listing status. The entered sell-by date has passed.";
  if (lot.readiness === "due_soon")
    return lot.daysUntilSellBy === 0
      ? "Sell-by date is today. Review buyer and collection arrangements."
      : `Sell-by date is in ${lot.daysUntilSellBy} days. Review buyer and collection arrangements.`;
  if (lot.readiness === "upcoming")
    return `Available in ${lot.daysUntilAvailable} days. Prepare the quality record and collection plan.`;
  return "Within the entered selling window. Compare reported mandi prices and buyer options.";
}
export function LotReadinessPanel({ lots, today }: { lots: LotReadinessInput[]; today: string }) {
  const readiness = buildLotReadiness(lots, today);
  const counts = {
    expired: readiness.filter((lot) => lot.readiness === "expired").length,
    dueSoon: readiness.filter((lot) => lot.readiness === "due_soon").length,
    upcoming: readiness.filter((lot) => lot.readiness === "upcoming").length,
    available: readiness.filter((lot) => lot.readiness === "available").length,
  };
  return (
    <section className={styles.panel} aria-labelledby="readiness-heading">
      <div className={styles.heading}>
        <div>
          <p className="eyebrow">Inventory planning</p>
          <h2 id="readiness-heading">Selling-window reminders</h2>
          <p className={styles.description}>
            Prioritise lots using the availability and sell-by dates you entered.
          </p>
        </div>
        <Link href="/farmer/markets" className="text-link">
          Compare market prices
        </Link>
      </div>
      <div className={styles.summary} aria-label="Lot readiness counts">
        <div>
          <strong>{counts.expired}</strong>
          <span>Past sell-by</span>
        </div>
        <div>
          <strong>{counts.dueSoon}</strong>
          <span>Due in 3 days</span>
        </div>
        <div>
          <strong>{counts.upcoming}</strong>
          <span>Upcoming</span>
        </div>
        <div>
          <strong>{counts.available}</strong>
          <span>In window</span>
        </div>
      </div>
      {readiness.length === 0 ? (
        <p className={styles.empty}>No valid lot dates are available for planning reminders.</p>
      ) : (
        <ul className={styles.list}>
          {readiness.map((lot) => (
            <li className={styles.item} key={lot.id}>
              <div className={styles.itemMain}>
                <div className={styles.itemHeading}>
                  <strong>{lot.crop}</strong>
                  <span className={styles.status} data-status={lot.readiness}>
                    {STATUS_LABELS[lot.readiness]}
                  </span>
                  <span className={styles.lotStatus}>{lot.status}</span>
                </div>
                <p>{getGuidance(lot)}</p>
                <span className={styles.dates}>
                  Available {formatDate(lot.available_from)} · Sell by {formatDate(lot.sell_by)}
                </span>
              </div>
              <Link href={`/farmer/produce/${lot.id}/quality`} className={styles.action}>
                Quality record <span aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.disclaimer}>
        Calendar reminders only. They do not measure freshness, predict spoilage or certify food
        safety.
      </p>
    </section>
  );
}
