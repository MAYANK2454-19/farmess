"use client";

import { useEffect, useId, useSyncExternalStore } from "react";
import { LANGUAGES } from "./languages";
import {
  getI18nSnapshot,
  getServerI18nSnapshot,
  setLanguage,
  startI18n,
  subscribeI18n,
} from "./runtime";

let started = false;

/**
 * Starts the in-page translator once, as soon as the app is running in the
 * browser, using the language remembered from the last visit.
 */
export function I18nStarter() {
  useEffect(() => {
    if (started) return;
    started = true;
    void startI18n();
  }, []);
  return null;
}

/**
 * Language menu. Each language is listed in its own script, so someone who
 * cannot read English can still find theirs. The menu itself is never
 * translated.
 */
export function LanguageSwitcher({ tone = "light" }: { tone?: "light" | "dark" }) {
  const id = useId();
  const { language, status } = useSyncExternalStore(
    subscribeI18n,
    getI18nSnapshot,
    getServerI18nSnapshot,
  );

  return (
    <div
      className={`language-switcher language-switcher-${tone}`}
      data-no-translate
      data-busy={status === "loading" ? "true" : undefined}
    >
      <label htmlFor={id}>
        <span aria-hidden="true">अ/A</span>
        <span className="sr-only">Language / भाषा</span>
      </label>
      <select
        id={id}
        value={language}
        onChange={(event) => void setLanguage(event.target.value)}
        aria-busy={status === "loading"}
      >
        {LANGUAGES.map((item) => (
          <option key={item.code} value={item.code} lang={item.code}>
            {item.native}
          </option>
        ))}
      </select>
      {status === "error" ? (
        <span className="language-switcher-error" role="status">
          Not available right now
        </span>
      ) : null}
    </div>
  );
}
