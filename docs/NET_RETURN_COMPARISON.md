# Net-return comparison contract

This module is an isolated comparison layer for one produce lot. It complements the single-scenario calculator in `src/features/calculations/net-realisation.ts`; it does not modify that implementation or the calculator UI.

## Comparison rules

- Compare only options that refer to the same `lotId`.
- Normalize the lot quantity and each option's rate unit to a common physical mass basis.
- Return net total and net realisation per quintal in INR.
- Rank only when at least two options are complete and explicitly marked feasible.
- An infeasible option, an option with unknown feasibility, an incomplete cost set, an invalid value or a different lot stays visible but receives no rank.
- Ties receive the same competition rank.
- Sort ranked options first, highest net INR/quintal first; unranked options follow.
- Require a named source, valid observation/retrieval dates and an HTTP(S) source URL for reported mandi observations. Buyer offers are checked against an explicit evaluation time; expired quotes remain visible but never rank. Manual scenarios must be labelled as entered or estimated.
- Expected quality loss appears once as the `expectedQualityLoss` deduction; do not subtract it again elsewhere.

## Monetary and quantity precision

- Money is represented as integer paise internally.
- Quantity accepts up to three decimal places.
- Supported mass units are kg, quintal (100 kg) and tonne (1,000 kg).
- Each option's quoted/reported rate can be expressed per kg, quintal or tonne.
- Gross value uses integer arithmetic with nearest-paise rounding.
- Net per quintal uses the common mass basis and nearest-paise rounding.
- Floating-point arithmetic is not used for monetary totals or ranking.

## Provenance

| Source               | Required value type      | Required source detail                                |
| -------------------- | ------------------------ | ----------------------------------------------------- |
| `market_observation` | `reported`               | Source name, observation date and retrieval timestamp |
| `buyer_offer`        | `quoted`                 | Source name and offer-valid-until timestamp           |
| `entered_scenario`   | `entered` or `estimated` | Source/entry label                                    |

The evaluation time is passed to `compareNetRealisationOptions(input, now)`. A buyer quote whose `validUntil` is at or before that time receives `expired` status and cannot rank. Market observations require an HTTP(S) `sourceUrl` so the result can retain a verifiable source reference. The module does not claim that an entered price is market data, that an offer is accepted, or that a market quote is still fresh. Callers must re-check current validity and feasibility at the time of display/action.

## Result interpretation

- `comparable`: at least two complete and feasible options can be ranked.
- `insufficient_data`: one or more candidates exist, but fewer than two are complete and feasible.
- `no_feasible_options`: no candidate can be considered for ranking.
- `invalid_lot`: the common lot identity/quantity is invalid.

Per-option status explains why a candidate was not ranked. A ranking is decision support, not a guaranteed sale, price or profit.

## Integration boundary

This is a pure domain module. The owning UI/API integration should:

1. Build options from source-backed market observations, actual buyer quotes or explicitly labelled farmer-entered scenarios.
2. Confirm options all refer to the selected produce lot.
3. Supply feasibility and its evidence/reasons; do not infer it from headline price.
4. Provide every cost explicitly. Blank values are unknown, not zero.
5. Render every returned reason, source label, provenance timestamp, deduction and unranked status.
6. Re-check offer validity, market freshness, consent and server-side permissions before actions.

No routes, migrations, dependencies or shared UI are changed by this slice.
