"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DEDUCTION_FIELDS, type DeductionField } from "@/features/calculations/net-realisation";

type Lot = {
  id: string;
  crop: string;
  quantity: number;
  unit: "kg" | "quintal" | "tonne";
  status: string;
  sell_by: string;
};

type MarketOption = {
  id: string;
  label: string;
  market: string;
  district: string | null;
  state: string | null;
  modalPricePerUnit: string;
  modalPricePaisePerQuintal: number;
  observationDate: string;
  retrievedAt: string;
  sourceName: string;
  sourceUrl: string;
  freshness: "fresh" | "stale";
  priceUnit: string;
};

type DeductionValues = Record<DeductionField, string>;

type ComparisonOption = {
  id: string;
  label: string;
  source: string;
  sourceName: string;
  valueType: string;
  observationDate: string | null;
  status: string;
  rank: number | null;
  grossSaleValue: string | null;
  deductionsTotal: string | null;
  netRealisation: string | null;
  netPerQuintal: string | null;
  deductionBreakdown: Record<DeductionField, string | null>;
  reasons: string[];
};

type ComparisonResponse = {
  lot: { id: string; crop: string; quantity: number; unit: string };
  comparison: {
    status: string;
    rankedOptionCount: number;
    options: ComparisonOption[];
    reasons: string[];
  };
  method: string;
  limitation: string;
};

const deductionLabels: Record<DeductionField, string> = {
  transportCost: "Transport cost (₹)",
  handlingPackagingCost: "Handling and packaging (₹)",
  marketCharges: "Market charges (₹)",
  storageCost: "Storage cost (₹)",
  expectedQualityLoss: "Estimated quality loss (₹)",
  otherDeductions: "Other deductions (₹)",
};

function emptyDeductions(): DeductionValues {
  return {
    transportCost: "",
    handlingPackagingCost: "",
    marketCharges: "",
    storageCost: "",
    expectedQualityLoss: "",
    otherDeductions: "",
  };
}

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date);
}

function formatMoney(value: string | null) {
  if (value === null) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

export function MarketDecisionSupport() {
  const [lots, setLots] = useState<Lot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState("");
  const [marketOptions, setMarketOptions] = useState<MarketOption[]>([]);
  const [costs, setCosts] = useState<Record<string, DeductionValues>>({});
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [loadingLots, setLoadingLots] = useState(true);
  const [loadingMarkets, setLoadingMarkets] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    void fetch("/api/produce-lots", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { lots?: Lot[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Your produce lots could not be loaded.");
        if (active) {
          const ownLots = result.lots ?? [];
          setLots(ownLots);
          if (ownLots.length > 0) setSelectedLotId(ownLots[0].id);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Your produce lots could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingLots(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function loadMarkets(lotId: string) {
    setLoadingMarkets(true);
    setError("");
    setMessage("");
    setMarketOptions([]);
    setCosts({});
    setComparison(null);

    try {
      const response = await fetch(`/api/market-decisions?lotId=${encodeURIComponent(lotId)}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        marketOptions?: MarketOption[];
        message?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Market observations could not be loaded.");

      const options = result.marketOptions ?? [];
      setMarketOptions(options);
      setCosts(
        Object.fromEntries(options.map((option) => [option.id, emptyDeductions()])),
      );
      if (result.message) setMessage(result.message);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Market observations could not be loaded.",
      );
    } finally {
      setLoadingMarkets(false);
    }
  }

  function handleLotChange(value: string) {
    setSelectedLotId(value);
    if (value) void loadMarkets(value);
  }

  function updateCost(optionId: string, field: DeductionField, value: string) {
    setCosts((current) => ({
      ...current,
      [optionId]: {
        ...(current[optionId] ?? emptyDeductions()),
        [field]: value,
      },
    }));
  }

  async function compare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setComparison(null);

    if (marketOptions.length < 2) {
      setError("At least two source-backed market observations are needed for a comparison.");
      return;
    }

    const freshOptions = marketOptions.filter((option) => option.freshness === "fresh");
    if (freshOptions.length < 2) {
      setError("Fewer than two markets have observations within the seven-day freshness window.");
      return;
    }

    const missingCost = freshOptions.some((option) =>
      DEDUCTION_FIELDS.some((field) => {
        const value = costs[option.id]?.[field.key];
        return value === undefined || value.trim() === "";
      }),
    );
    if (missingCost) {
      setError("Enter every cost for each fresh market. Use 0 where a cost does not apply.");
      return;
    }

    setComparing(true);
    try {
      const response = await fetch("/api/market-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          lotId: selectedLotId,
          options: marketOptions.map((option) => ({
            id: option.id,
            deductions: costs[option.id] ?? emptyDeductions(),
          })),
        }),
      });
      const result = (await response.json()) as ComparisonResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in result ? result.error ?? "Market comparison failed." : "Market comparison failed.");
      }
      setComparison(result as ComparisonResponse);
    } catch (compareError) {
      setError(
        compareError instanceof Error ? compareError.message : "Market comparison failed.",
      );
    } finally {
      setComparing(false);
    }
  }

  const selectedLot = lots.find((lot) => lot.id === selectedLotId);

  return (
    <section className="market-decision-support" aria-labelledby="market-decision-heading">
      <div className="market-decision-intro">
        <p className="eyebrow">Market decision support</p>
        <h2 id="market-decision-heading">Which market leaves the strongest net return?</h2>
        <p>
          Farmess uses the latest source-reported modal mandi prices for your crop, then subtracts the costs you enter for each market.
          Only reports within the last seven days can be ranked.
        </p>
      </div>

      <section className="panel market-decision-select">
        <label className="form-field">
          <span className="form-label">Your produce lot</span>
          <select
            className="form-control"
            value={selectedLotId}
            onChange={(event) => handleLotChange(event.target.value)}
            disabled={loadingLots || lots.length === 0}
          >
            <option value="">
              {loadingLots ? "Loading your lots…" : lots.length ? "Choose a produce lot" : "No saved produce lots"}
            </option>
            {lots.map((lot) => (
              <option value={lot.id} key={lot.id}>
                {lot.crop} · {lot.quantity} {lot.unit} · {lot.status}
              </option>
            ))}
          </select>
        </label>

        {selectedLot ? (
          <p className="market-decision-lot-note">
            Comparing the same lot of {selectedLot.quantity} {selectedLot.unit} of {selectedLot.crop}.
            Current asking or offer prices are not inferred from mandi observations.
          </p>
        ) : null}

        {error ? <p className="form-alert" role="alert">{error}</p> : null}
        {message ? <p className="form-help" role="status">{message}</p> : null}
      </section>

      {loadingMarkets ? (
        <section className="panel empty-state">
          <p className="empty-copy" role="status">Loading source-attributed market observations…</p>
        </section>
      ) : null}

      {selectedLotId && !loadingMarkets && marketOptions.length === 0 ? (
        <section className="panel empty-state">
          <h3 className="empty-title">No stored market observations for this crop</h3>
          <p className="empty-copy">
            Farmess cannot compare markets until source-attributed mandi observations are imported. No demo prices are substituted.
          </p>
        </section>
      ) : null}

      {marketOptions.length > 0 ? (
        <form className="market-decision-options" onSubmit={compare}>
          <div className="section-heading">
            <div>
              <h3>Markets with recorded observations</h3>
              <p>Enter your expected total costs in rupees for the entire lot at each market.</p>
            </div>
          </div>

          {marketOptions.map((option) => (
            <article className={"panel market-decision-option" + (option.freshness === "stale" ? " stale" : "")} key={option.id}>
              <div className="market-decision-option-heading">
                <div>
                  <p className="eyebrow">{option.freshness === "fresh" ? "Recent source report" : "Stale report · not rankable"}</p>
                  <h4>{option.label}</h4>
                  <p className="market-decision-price">
                    {option.modalPricePerUnit} {option.priceUnit}
                  </p>
                </div>
                <div className="market-decision-observation">
                  <span>Observed</span>
                  <strong>{formatDate(option.observationDate)}</strong>
                  <a href={option.sourceUrl} target="_blank" rel="noreferrer">Source: {option.sourceName}</a>
                </div>
              </div>

              {option.freshness === "stale" ? (
                <p className="market-decision-stale-note">
                  This observation is older than seven days or has a future date. It is shown for context only and will not be ranked.
                </p>
              ) : (
                <div className="market-decision-cost-grid">
                  {DEDUCTION_FIELDS.map((field) => (
                    <label className="form-field" key={field.key}>
                      <span className="form-label">{deductionLabels[field.key]}</span>
                      <input
                        className="form-control"
                        inputMode="decimal"
                        value={costs[option.id]?.[field.key] ?? ""}
                        onChange={(event) => updateCost(option.id, field.key, event.target.value)}
                        placeholder="Enter amount; use 0 if none"
                        required
                      />
                    </label>
                  ))}
                </div>
              )}
            </article>
          ))}

          <div className="market-decision-submit">
            <p className="form-warning">
              All cost inputs are your estimates. Farmess does not auto-fill transport, storage or quality-loss costs.
            </p>
            <button className="button button-primary" type="submit" disabled={comparing || loadingMarkets}>
              {comparing ? "Calculating net returns…" : "Compare net returns"}
            </button>
          </div>
        </form>
      ) : null}

      {comparison ? (
        <section className="market-decision-results" aria-labelledby="market-decision-results-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Calculation result</p>
              <h3 id="market-decision-results-heading">Net realisation by market</h3>
              <p>{comparison.comparison.reasons.join(" ")}</p>
            </div>
          </div>

          <div className="market-decision-result-list">
            {comparison.comparison.options.map((option) => (
              <article className="panel market-decision-result" key={option.id}>
                <div className="market-decision-result-heading">
                  <div>
                    <h4>{option.label}</h4>
                    <span className={"produce-status produce-status-" + option.status}>
                      {option.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  {option.rank !== null ? <strong className="market-decision-rank">#{option.rank}</strong> : null}
                </div>
                <div className="market-decision-result-facts">
                  <div><span>Gross sale value</span><strong>{formatMoney(option.grossSaleValue)}</strong></div>
                  <div><span>Total deductions</span><strong>{formatMoney(option.deductionsTotal)}</strong></div>
                  <div><span>Net realisation</span><strong>{formatMoney(option.netRealisation)}</strong></div>
                  <div><span>Net per quintal</span><strong>{formatMoney(option.netPerQuintal)}</strong></div>
                </div>
                {option.reasons.length ? <p className="market-decision-result-note">{option.reasons.join(" ")}</p> : null}
              </article>
            ))}
          </div>

          <p className="market-forecast-footnote">
            This is arithmetic over source-reported mandi modal prices and costs you entered. It does not include unentered road distance, buyer reliability, negotiation, taxes or unrecorded losses. It is not a guarantee of a sale price.
          </p>
        </section>
      ) : null}
    </section>
  );
}
