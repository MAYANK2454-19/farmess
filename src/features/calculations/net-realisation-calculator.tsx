"use client";

import { useMemo, useState } from "react";

import {
  calculateNetRealisation,
  DEDUCTION_FIELDS,
  QUANTITY_UNITS,
  type CalculationField,
  type NetRealisationInput,
} from "./net-realisation";
import styles from "./net-realisation-calculator.module.css";

const initialInput: NetRealisationInput = {
  quantity: "",
  unit: "quintal",
  expectedPricePerUnit: "",
  transportCost: "",
  handlingPackagingCost: "",
  marketCharges: "",
  storageCost: "",
  expectedQualityLoss: "",
  otherDeductions: "",
};

function getFieldLabel(field: CalculationField): string {
  if (field === "quantity") return "Quantity";
  if (field === "unit") return "Quantity unit";
  if (field === "expectedPricePerUnit") return "Expected selling rate";

  return DEDUCTION_FIELDS.find((item) => item.key === field)?.label ?? field;
}

export function NetRealisationCalculator() {
  const [input, setInput] = useState<NetRealisationInput>(initialInput);
  const result = useMemo(() => calculateNetRealisation(input), [input]);

  function update<K extends keyof NetRealisationInput>(key: K, value: NetRealisationInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className={styles.calculator}>
      <section className={"panel " + styles.formPanel}>
        <div className="module-status">Entered scenario · not a market quote</div>
        <h2 className={styles.sectionTitle}>Selling option details</h2>
        <p className={styles.intro}>
          Enter a selling rate and the costs for this produce lot. The rate and every deduction are
          inputs you provide; Farmess does not fetch or invent a price here.
        </p>

        <div className={styles.sectionBlock}>
          <h3 className={styles.subheading}>Produce and expected sale value</h3>
          <div className={styles.fieldGrid}>
            <label className="form-field">
              <span className="form-label">Quantity *</span>
              <input
                className="form-control"
                type="number"
                min="0.001"
                step="0.001"
                inputMode="decimal"
                value={input.quantity}
                onChange={(event) => update("quantity", event.target.value)}
                placeholder="Enter lot quantity"
                aria-invalid={Boolean(result.errors.quantity)}
              />
              {result.errors.quantity ? (
                <span className={styles.errorText}>{result.errors.quantity}</span>
              ) : null}
            </label>

            <label className="form-field">
              <span className="form-label">Quantity unit *</span>
              <select
                className="form-control"
                value={input.unit}
                onChange={(event) =>
                  update("unit", event.target.value as NetRealisationInput["unit"])
                }
              >
                {QUANTITY_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit === "kg" ? "Kilogram (kg)" : unit === "quintal" ? "Quintal" : "Tonne"}
                  </option>
                ))}
              </select>
            </label>

            <label className={"form-field " + styles.wideField}>
              <span className="form-label">Expected selling rate (₹ / {input.unit}) *</span>
              <input
                className="form-control"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={input.expectedPricePerUnit}
                onChange={(event) => update("expectedPricePerUnit", event.target.value)}
                placeholder={"Enter rate per " + input.unit}
                aria-invalid={Boolean(result.errors.expectedPricePerUnit)}
              />
              {result.errors.expectedPricePerUnit ? (
                <span className={styles.errorText}>{result.errors.expectedPricePerUnit}</span>
              ) : null}
              <span className="form-help">Use a rate on the same unit basis selected above.</span>
            </label>
          </div>
        </div>

        <div className={styles.sectionBlock}>
          <h3 className={styles.subheading}>Costs and deductions for this lot</h3>
          <p className={styles.helperText}>
            Enter the total rupee amount for each item. Enter 0 only when you know that no cost
            applies; leaving a field blank keeps the result incomplete.
          </p>
          <div className={styles.fieldGrid}>
            {DEDUCTION_FIELDS.map((field) => (
              <label className="form-field" key={field.key}>
                <span className="form-label">{field.label} (₹) *</span>
                <input
                  className="form-control"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={input[field.key]}
                  onChange={(event) => update(field.key, event.target.value)}
                  placeholder="Enter amount"
                  aria-invalid={Boolean(result.errors[field.key])}
                />
                {result.errors[field.key] ? (
                  <span className={styles.errorText}>{result.errors[field.key]}</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      </section>

      <aside className={"panel " + styles.resultPanel}>
        <div className={styles.resultHeader}>
          <span className={styles.resultEyebrow}>Scenario result</span>
          <span
            className={
              styles.status +
              " " +
              (result.status === "complete"
                ? styles.statusComplete
                : result.status === "invalid"
                  ? styles.statusInvalid
                  : styles.statusIncomplete)
            }
          >
            {result.status === "complete"
              ? "Complete"
              : result.status === "invalid"
                ? "Check inputs"
                : "Incomplete"}
          </span>
        </div>

        <h2 className={styles.netLabel}>Estimated net realisation</h2>
        <p className={styles.netValue} aria-live="polite">
          {result.netRealisation === null ? "—" : "₹" + result.netRealisation}
        </p>
        <p className={styles.resultCaption}>
          {result.status === "complete"
            ? "Based only on the values entered for this lot."
            : "Complete and validate all required fields to see the net amount."}
        </p>

        <div className={styles.totals}>
          <div className={styles.totalRow}>
            <span>Expected sale value</span>
            <strong>{result.grossSaleValue === null ? "—" : "₹" + result.grossSaleValue}</strong>
          </div>
          <div className={styles.totalRow}>
            <span>Total deductions</span>
            <strong>{result.deductionsTotal === null ? "—" : "₹" + result.deductionsTotal}</strong>
          </div>
        </div>

        <div className={styles.breakdown}>
          <h3>Deduction breakdown</h3>
          {DEDUCTION_FIELDS.map((field) => (
            <div className={styles.breakdownRow} key={field.key}>
              <span>{field.label}</span>
              <strong>
                {result.deductionBreakdown[field.key] === null
                  ? "Not entered"
                  : "₹" + result.deductionBreakdown[field.key]}
              </strong>
            </div>
          ))}
        </div>

        {result.missingFields.length > 0 ? (
          <div className={styles.notice} role="status">
            <strong>Still required</strong>
            <span>{result.missingFields.map(getFieldLabel).join(", ")}.</span>
          </div>
        ) : null}

        <p className={styles.disclaimer}>
          This is an estimate, not a guaranteed selling price, profit, buyer offer or sale. It does
          not include market data unless you enter a rate yourself.
        </p>
      </aside>
    </div>
  );
}
