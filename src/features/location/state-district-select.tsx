"use client";

import { INDIA_STATES, districtsForState } from "@/lib/location/india";

/**
 * State/UT dropdown followed by a District dropdown filtered to that state.
 * Renders two <label> elements so it slots into existing form grids.
 * Both are optional ("Any state" / "Any district") for search filters.
 */
export function StateDistrictSelect({
  state,
  district,
  onChange,
  idPrefix,
  labelClassName,
  labelTextClassName,
  selectClassName,
}: {
  state: string;
  district: string;
  onChange: (next: { state: string; district: string }) => void;
  idPrefix: string;
  labelClassName?: string;
  labelTextClassName?: string;
  selectClassName?: string;
}) {
  const districts = state ? [...districtsForState(state)] : [];
  // Keep a previously entered district visible even if it is not in the list.
  if (district && !districts.includes(district)) districts.unshift(district);

  return (
    <>
      <label className={labelClassName} htmlFor={`${idPrefix}-state`}>
        <span className={labelTextClassName}>State / UT</span>
        <select
          id={`${idPrefix}-state`}
          className={selectClassName}
          value={state}
          onChange={(event) => onChange({ state: event.target.value, district: "" })}
        >
          <option value="">Any state</option>
          {INDIA_STATES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClassName} htmlFor={`${idPrefix}-district`}>
        <span className={labelTextClassName}>District</span>
        <select
          id={`${idPrefix}-district`}
          className={selectClassName}
          value={district}
          disabled={!state}
          onChange={(event) => onChange({ state, district: event.target.value })}
        >
          <option value="">{state ? "Any district" : "Choose a state first"}</option>
          {districts.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
