import type { MarketSourceQuality } from "@/lib/market-data/types";
import { getMarketSourceQualityReasons } from "@/lib/market-data/source-quality";
import styles from "./source-quality-panel.module.css";

type SourceQualityPanelProps = {
  quality: MarketSourceQuality;
};

export function SourceQualityPanel({ quality }: SourceQualityPanelProps) {
  const reasons = getMarketSourceQualityReasons(quality);

  return (
    <section className={`panel ${styles.panel}`} aria-labelledby="source-quality-heading">
      <div className={styles.heading}>
        <div>
          <h2 id="source-quality-heading">Source quality check</h2>
          <p>How the source records were checked before showing market prices.</p>
        </div>
        <span className={styles.status}>
          {quality.rejected === 0 ? "No rows rejected" : "Some rows excluded"}
        </span>
      </div>

      <dl className={styles.metrics}>
        <div>
          <dt>Records checked</dt>
          <dd>{quality.received}</dd>
        </div>
        <div>
          <dt>Usable records</dt>
          <dd>{quality.accepted}</dd>
        </div>
        <div>
          <dt>Excluded records</dt>
          <dd>{quality.rejected}</dd>
        </div>
      </dl>

      {reasons.length > 0 ? (
        <details className={styles.details}>
          <summary>Why records were excluded</summary>
          <ul>
            {reasons.map((item) => (
              <li key={item.reason}>
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <p className={styles.cleanMessage}>
          All received rows passed the source identity, date and price checks.
        </p>
      )}

      <p className={styles.note}>
        Excluded rows are not used in the displayed prices. These checks do not guarantee that a
        market observation is current or that a quoted price will be available to sell at.
      </p>
    </section>
  );
}
