"use client";

import { findLanguage, LANGUAGE_COOKIE, LANGUAGE_STORAGE_KEY, SOURCE_LANGUAGE } from "./languages";
import { createTranslator, type Dictionary, type Translate } from "./translator";
import versions from "./versions.json";

/*
 * Shows the interface in another language without changing any component.
 *
 * Components render English. This module then replaces the text the browser
 * shows (text nodes and a few attributes such as placeholders) with the
 * dictionary's translation, and keeps doing so as the page changes. It only
 * ever changes the characters inside existing text nodes, which React leaves
 * alone until it has new English text to show; that new text is then
 * translated in turn. The English original of every node is remembered, so
 * switching language or back to English needs no reload.
 */

const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
/**
 * Text inside these is never touched: code, text people typed themselves
 * (notes, messages, comments, names), or text already in another language.
 */
const SKIP = [
  "script,style,noscript,textarea,code,pre",
  "[contenteditable],[data-no-translate],[translate='no'],[lang]:not(html)",
  ".offer-note,.operator-request-message,.service-description,.rating-received-list p",
  ".sidebar-role-copy strong,.contact-card-lines,.feedback-note,.lot-notes,.admin-note-text",
].join(",");

type Shown = { source: string; shown: string };

const textState = new WeakMap<Text, Shown>();
const attributeState = new WeakMap<Element, Map<string, Shown>>();
const dictionaries = new Map<string, Promise<Dictionary>>();

let translate: Translate | null = null;
let observer: MutationObserver | null = null;
let current = SOURCE_LANGUAGE;
export type I18nStatus = "idle" | "loading" | "ready" | "error";
let status: I18nStatus = "idle";
const listeners = new Set<() => void>();

export type I18nSnapshot = { language: string; status: I18nStatus };
let snapshot: I18nSnapshot = { language: current, status };

function publish() {
  snapshot = { language: current, status };
  for (const listener of listeners) listener();
}

export function subscribeI18n(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getI18nSnapshot = (): I18nSnapshot => snapshot;
const serverSnapshot: I18nSnapshot = { language: SOURCE_LANGUAGE, status: "idle" };
export const getServerI18nSnapshot = (): I18nSnapshot => serverSnapshot;

export function readStoredLanguage(): string {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && findLanguage(stored)) return stored;
  } catch {
    // Storage unavailable: fall back to the cookie.
  }
  const cookie = new RegExp(`(?:^|; )${LANGUAGE_COOKIE}=([a-z]{2,3})`).exec(document.cookie)?.[1];
  return cookie && findLanguage(cookie) ? cookie : SOURCE_LANGUAGE;
}

function storeLanguage(code: string) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
  } catch {
    // The cookie below still remembers the choice.
  }
  document.cookie = `${LANGUAGE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
}

function loadDictionary(code: string): Promise<Dictionary> {
  let pending = dictionaries.get(code);
  if (!pending) {
    // The fingerprint changes whenever the dictionary does, so a cached copy is never stale.
    const version = (versions as Record<string, string>)[code] ?? "0";
    pending = fetch(`/i18n/${code}.json?v=${version}`).then(async (response) => {
      if (!response.ok) throw new Error(`No dictionary for ${code}.`);
      const data = (await response.json()) as Partial<Dictionary>;
      return { strings: data.strings ?? {}, templates: data.templates ?? {} };
    });
    pending.catch(() => dictionaries.delete(code));
    dictionaries.set(code, pending);
  }
  return pending;
}

function skipped(node: Node): boolean {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return !element || element.closest(SKIP) !== null;
}

function applyText(node: Text) {
  const value = node.nodeValue ?? "";
  const known = textState.get(node);
  // Our own change, seen again through the observer.
  if (known && known.shown === value) return;
  if (!translate) return;
  if (skipped(node)) return;
  const translated = translate(value);
  if (translated === null || translated === value) {
    textState.delete(node);
    return;
  }
  textState.set(node, { source: value, shown: translated });
  node.nodeValue = translated;
}

function applyAttributes(element: Element) {
  if (!translate || skipped(element)) return;
  for (const name of ATTRIBUTES) {
    const value = element.getAttribute(name);
    if (!value) continue;
    const known = attributeState.get(element)?.get(name);
    if (known && known.shown === value) continue;
    const translated = translate(value);
    if (translated === null || translated === value) continue;
    let map = attributeState.get(element);
    if (!map) {
      map = new Map();
      attributeState.set(element, map);
    }
    map.set(name, { source: value, shown: translated });
    element.setAttribute(name, translated);
  }
}

function applyTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    applyText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  applyAttributes(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) applyText(node as Text);
    else applyAttributes(node as Element);
  }
}

/** Put the English text back everywhere (before switching language or to English). */
function restoreTree(root: Node) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      const known = textState.get(node as Text);
      if (known && node.nodeValue === known.shown) node.nodeValue = known.source;
      textState.delete(node as Text);
    } else {
      const map = attributeState.get(node as Element);
      if (!map) continue;
      for (const [name, known] of map) {
        if ((node as Element).getAttribute(name) === known.shown) {
          (node as Element).setAttribute(name, known.source);
        }
      }
      attributeState.delete(node as Element);
    }
  }
}

function watch() {
  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") applyTree(record.target);
      else if (record.type === "attributes") applyAttributes(record.target as Element);
      else for (const node of record.addedNodes) applyTree(node);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRIBUTES],
  });
}

function markDocument(code: string) {
  const root = document.documentElement;
  const language = findLanguage(code);
  root.lang = code;
  if (code === SOURCE_LANGUAGE) {
    root.removeAttribute("data-i18n");
    root.removeAttribute("data-i18n-rtl");
  } else {
    root.setAttribute("data-i18n", "ready");
    if (language?.rtl) root.setAttribute("data-i18n-rtl", "");
    else root.removeAttribute("data-i18n-rtl");
  }
}

/** Show the interface in `code`. Resolves when the page has been translated. */
export async function setLanguage(code: string, options: { remember?: boolean } = {}) {
  const language = findLanguage(code) ?? findLanguage(SOURCE_LANGUAGE)!;
  if (options.remember !== false) storeLanguage(language.code);

  observer?.disconnect();
  observer = null;
  translate = null;
  restoreTree(document.body);
  current = language.code;

  if (language.code === SOURCE_LANGUAGE) {
    status = "idle";
    markDocument(SOURCE_LANGUAGE);
    publish();
    return;
  }

  status = "loading";
  publish();
  try {
    const dictionary = await loadDictionary(language.code);
    // Another language was chosen while this one was loading.
    if (current !== language.code) return;
    translate = createTranslator(dictionary);
    applyTree(document.body);
    watch();
    status = "ready";
    markDocument(language.code);
  } catch {
    // No dictionary could be loaded: stay in English rather than half-translated.
    current = SOURCE_LANGUAGE;
    status = "error";
    markDocument(SOURCE_LANGUAGE);
  }
  publish();
}

/** Called once when the app starts in the browser. */
export async function startI18n() {
  const stored = readStoredLanguage();
  if (stored !== SOURCE_LANGUAGE) await setLanguage(stored, { remember: false });
  // Whatever happened, never leave the page hidden by the start-up script.
  document.documentElement.removeAttribute("data-i18n-pending");
}
