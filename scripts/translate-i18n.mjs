// Translates the interface strings in src/i18n/catalog.json into the languages
// listed in src/i18n/languages.ts and writes public/i18n/<code>.json.
//
//   node scripts/translate-i18n.mjs            translate what is missing, all languages
//   node scripts/translate-i18n.mjs hi pa      only these languages
//   node scripts/translate-i18n.mjs --check    report coverage, translate nothing
//
// It uses the Gemini API with GEMINI_API_KEY from .env.local. The key is used
// only by this script on a developer's machine: it is not needed by the
// running app and must not be added to Vercel. Translations are machine-made
// and should be read by a speaker of each language before they are relied on.
//
// Safe to stop and run again: finished batches are saved as they complete, and
// only strings without a translation are sent.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const CATALOG = "src/i18n/catalog.json";
const LANGUAGES_FILE = "src/i18n/languages.ts";
const OUT_DIR = "public/i18n";
const VERSIONS = "src/i18n/versions.json";
const BATCH = 120;
const CONCURRENCY = 2;
// Tried in order; the next one is used when a model is busy, rate-limited or
// retired. "low" keeps the model from spending a long time reasoning about
// what is a simple translation task.
const MODELS = [
  { name: "gemini-3.5-flash", thinking: { thinkingLevel: "low" } },
  { name: "gemini-3.5-flash-lite", thinking: null },
  { name: "gemini-flash-lite-latest", thinking: null },
];
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const wanted = args.filter((arg) => !arg.startsWith("--"));

function readKey() {
  if (process.env.GEMINI_API_KEY?.trim()) return process.env.GEMINI_API_KEY.trim();
  try {
    const env = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
    return env.match(/^GEMINI_API_KEY\s*=\s*"?([^"\r\n]*)"?/m)?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}

function readLanguages() {
  const source = readFileSync(LANGUAGES_FILE, "utf8");
  const list = [];
  for (const match of source.matchAll(
    /\{ code: "([a-z]{2,3})", name: "([^"]+)", native: "([^"]+)", script: "([^"]+)"/g,
  )) {
    if (match[1] !== "en")
      list.push({ code: match[1], name: match[2], native: match[3], script: match[4] });
  }
  return list;
}

const placeholders = (text) =>
  [...text.matchAll(/\{\d+\}/g)]
    .map((m) => m[0])
    .sort()
    .join(",");
/** Unicode script of each language's writing, as named in src/i18n/languages.ts. */
const SCRIPT_OF = {
  Devanagari: "Devanagari",
  Gurmukhi: "Gurmukhi",
  "Perso-Arabic (Nastaliq)": "Arabic",
  "Perso-Arabic": "Arabic",
  Bengali: "Bengali",
  "Bengali-Assamese": "Bengali",
  Gujarati: "Gujarati",
  Tamil: "Tamil",
  Telugu: "Telugu",
  Kannada: "Kannada",
  Malayalam: "Malayalam",
  Odia: "Oriya",
};
const INDIAN_SCRIPTS = [...new Set(Object.values(SCRIPT_OF))];

/**
 * Letters from an Indian script other than the language's own mean the model
 * slipped into another language or produced garbled text.
 */
function foreignScript(language) {
  const own = SCRIPT_OF[language.script];
  const others = INDIAN_SCRIPTS.filter((script) => script !== own);
  return own ? new RegExp(others.map((script) => `\\p{Script=${script}}`).join("|"), "u") : null;
}

function usableFor(language) {
  const foreign = foreignScript(language);
  return (source, translation) =>
    typeof translation === "string" &&
    translation.trim() !== "" &&
    placeholders(source) === placeholders(translation) &&
    !(foreign && foreign.test(translation));
}

function loadDictionary(code) {
  const file = `${OUT_DIR}/${code}.json`;
  if (!existsSync(file)) return { strings: {}, templates: {} };
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return { strings: data.strings ?? {}, templates: data.templates ?? {} };
  } catch {
    return { strings: {}, templates: {} };
  }
}

function saveDictionary(language, dictionary, catalog) {
  const usable = usableFor(language);
  // Keep only current catalog entries, in catalog order, so the files stay tidy.
  const strings = {};
  for (const source of catalog.strings) {
    if (usable(source, dictionary.strings[source])) strings[source] = dictionary.strings[source];
  }
  const templates = {};
  for (const source of catalog.templates) {
    if (usable(source, dictionary.templates[source]))
      templates[source] = dictionary.templates[source];
  }
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    `${OUT_DIR}/${language.code}.json`,
    JSON.stringify(
      {
        language: language.code,
        name: language.name,
        note: "Machine translation (Gemini) of the Farmess interface. Not yet reviewed by a speaker.",
        strings,
        templates,
      },
      null,
      1,
    ) + "\n",
  );
  return Object.keys(strings).length + Object.keys(templates).length;
}

function instruction(language) {
  return [
    `You translate the user interface of Farmess, a web app that helps small farmers in India compare mandi (market) prices, sell produce to buyers and book transport or storage.`,
    `Translate each English string into ${language.name} written in the ${language.script} script.`,
    `Rules:`,
    `- Use simple, everyday words a farmer with basic schooling understands. Prefer common spoken terms over formal or Sanskritised ones.`,
    `- Keep it short: many strings are buttons, labels and table headings.`,
    `- Keep placeholders such as {0}, {1} exactly as they are; they stand for names or numbers. Put them where the sentence needs them.`,
    `- Keep numbers, the rupee sign, units like km, and the names Farmess, AGMARKNET, data.gov.in, Open-Meteo, OpenStreetMap, HeiGIT, PIN, GPS, API and CSV unchanged.`,
    `- Translate crop names with the name farmers commonly use; if there is no common name, write the English name in the ${language.script} script.`,
    `- Keep punctuation, ellipses, arrows and emoji. Do not add explanations or quotation marks.`,
    `- A lone word such as "pending", "accepted" or "quintal" is a status or unit shown in a list: translate it as such.`,
    `Return only a JSON array of strings: one translation per input string, same order, same count.`,
  ].join("\n");
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(key, language, batch, state) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const model = MODELS[state.model % MODELS.length];
    const body = {
      systemInstruction: { parts: [{ text: instruction(language) }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(batch) }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: { type: "ARRAY", items: { type: "STRING" } },
        ...(model.thinking ? { thinkingConfig: model.thinking } : {}),
      },
    };
    let response;
    try {
      response = await fetch(`${ENDPOINT}/${model.name}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      // No answer in two minutes: this model is stuck, use the next one.
      state.model += 1;
      await sleep(2_000);
      continue;
    }
    if (response.status === 429 || response.status === 503 || response.status === 500) {
      // Rate limit or busy: wait, and if it keeps happening try the next model.
      if (attempt >= 1) state.model += 1;
      await sleep(Math.min(45_000, 6_000 * (attempt + 1)));
      continue;
    }
    if (response.status === 404 || response.status === 400) {
      const detail = await response.text().catch(() => "");
      if (response.status === 404 || /model/i.test(detail)) {
        state.model += 1;
        continue;
      }
      throw new Error(`Gemini refused the request (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}.`);
    const payload = await response.json().catch(() => null);
    const text =
      payload?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall through and retry: the model sometimes returns a truncated array.
    }
    await sleep(2_000);
  }
  return null;
}

async function translateLanguage(key, language, catalog) {
  const usable = usableFor(language);
  const dictionary = loadDictionary(language.code);
  const pending = [
    ...catalog.strings
      .filter((s) => !usable(s, dictionary.strings[s]))
      .map((s) => ({ kind: "strings", source: s })),
    ...catalog.templates
      .filter((s) => !usable(s, dictionary.templates[s]))
      .map((s) => ({ kind: "templates", source: s })),
  ];
  const total = catalog.strings.length + catalog.templates.length;
  if (checkOnly || pending.length === 0) {
    const done = saveDictionary(language, dictionary, catalog);
    console.log(`${language.code.padEnd(4)} ${language.name.padEnd(10)} ${done}/${total}`);
    return;
  }

  const batches = [];
  for (let i = 0; i < pending.length; i += BATCH) batches.push(pending.slice(i, i + BATCH));
  const state = { model: 0 };
  let next = 0;
  let failed = 0;

  async function worker() {
    while (next < batches.length) {
      const batch = batches[next];
      next += 1;
      const result = await callGemini(
        key,
        language,
        batch.map((item) => item.source),
        state,
      );
      if (!result || result.length !== batch.length) {
        failed += batch.length;
        continue;
      }
      batch.forEach((item, i) => {
        if (usable(item.source, result[i])) dictionary[item.kind][item.source] = result[i].trim();
        else failed += 1;
      });
      saveDictionary(language, dictionary, catalog);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
  const done = saveDictionary(language, dictionary, catalog);
  console.log(
    `${language.code.padEnd(4)} ${language.name.padEnd(10)} ${done}/${total}` +
      (failed ? `  (${failed} not translated this run; run again to retry)` : ""),
  );
}

/** A short fingerprint of each dictionary, used in its address so browsers reload it when it changes. */
function writeVersions() {
  const versions = {};
  for (const language of readLanguages()) {
    const file = `${OUT_DIR}/${language.code}.json`;
    if (!existsSync(file)) continue;
    // Line endings differ between machines; the fingerprint must not.
    const content = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    versions[language.code] = createHash("sha1").update(content).digest("hex").slice(0, 10);
  }
  writeFileSync(VERSIONS, JSON.stringify(versions, null, 2) + "\n");
}

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));
const languages = readLanguages().filter(
  (language) => wanted.length === 0 || wanted.includes(language.code),
);
if (languages.length === 0) {
  console.error("No matching languages.");
  process.exit(1);
}
const key = readKey();
if (!key && !checkOnly) {
  console.error("GEMINI_API_KEY is not set. Add it to .env.local (it is not needed on Vercel).");
  process.exit(1);
}
console.log(`catalog: ${catalog.strings.length} strings, ${catalog.templates.length} templates`);
for (const language of languages) {
  try {
    await translateLanguage(key, language, catalog);
  } catch (error) {
    console.log(
      `${language.code.padEnd(4)} stopped: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}
writeVersions();
