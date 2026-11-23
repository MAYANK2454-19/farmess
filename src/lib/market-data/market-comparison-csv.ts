import type { MarketComparisonGroup } from "./market-comparison.ts";

type CsvCell = string | number | null;
type CsvColumn = [
  string,
  (
    group: MarketComparisonGroup,
    market: MarketComparisonGroup["markets"][number],
  ) => CsvCell,
];

function csvCell(value: CsvCell): string {
  const normalized = value === null ? "" : String(value);
  const safeValue = /^[\u0000-\u0020]*[=+@-]/.test(normalized)
    ? "'" + normalized
    : normalized;
  return '"' + safeValue.replace(/"/g, '""') + '"';
}

/** Export the comparable reported-price rows without widening the active filters. */
export function marketPriceComparisonsToCsv(
  comparisons: readonly MarketComparisonGroup[],
): string {
  const columns: CsvColumn[] = [
    ["Commodity", (group) => group.commodity],
    ["Variety", (group) => group.variety],
    ["Observation date", (group) => group.observationDate],
    ["Mandi", (_, market) => market.market],
    ["District", (_, market) => market.district],
    ["State", (_, market) => market.state],
    ["Average reported modal price", (_, market) => market.averageModalPrice.toFixed(2)],
    ["Records averaged", (_, market) => market.observationCount],
    ["Lowest reported modal price", (_, market) => market.lowestModalPrice.toFixed(2)],
    ["Highest reported modal price", (_, market) => market.highestModalPrice.toFixed(2)],
    ["Same-day price spread", (group) => group.priceSpread.toFixed(2)],
    [
      "Spread percent from lowest",
      (group) => (group.spreadPercent === null ? null : group.spreadPercent.toFixed(2)),
    ],
    ["Price unit", () => "INR/quintal"],
  ];
  const header = columns.map(([label]) => csvCell(label)).join(",");
  const rows = comparisons.flatMap((group) =>
    group.markets.map((market) =>
      columns.map(([, getValue]) => csvCell(getValue(group, market))).join(","),
    ),
  );

  return "\uFEFF" + [header, ...rows].join("\r\n") + "\r\n";
}
