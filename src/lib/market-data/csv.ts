export type CsvMarketPriceRecord = {
  commodity: string;
  variety: string | null;
  state: string;
  district: string;
  market: string;
  minPrice: string | null;
  maxPrice: string | null;
  modalPrice: string | null;
  priceUnit: string;
  observationDate: string;
  retrievedAt: string;
  sourceName: string;
  sourceUrl: string;
  valueType: "reported" | "demo";
};

const COLUMNS: Array<[string, (record: CsvMarketPriceRecord) => string | null]> = [
  ["Commodity", (record) => record.commodity],
  ["Variety", (record) => record.variety],
  ["State", (record) => record.state],
  ["District", (record) => record.district],
  ["Market", (record) => record.market],
  ["Minimum price", (record) => record.minPrice],
  ["Modal price", (record) => record.modalPrice],
  ["Maximum price", (record) => record.maxPrice],
  ["Price unit", (record) => record.priceUnit],
  ["Observation date", (record) => record.observationDate],
  ["Retrieved at", (record) => record.retrievedAt],
  ["Source", (record) => record.sourceName],
  ["Source URL", (record) => record.sourceUrl],
  ["Value type", (record) => record.valueType],
];

function csvCell(value: string | null): string {
  const normalized = value ?? "";
  const safeValue = /^[\u0000-\u0020]*[=+@-]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function marketPriceRecordsToCsv(records: CsvMarketPriceRecord[]): string {
  const header = COLUMNS.map(([label]) => csvCell(label)).join(",");
  const rows = records.map((record) =>
    COLUMNS.map(([, getValue]) => csvCell(getValue(record))).join(","),
  );

  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}
