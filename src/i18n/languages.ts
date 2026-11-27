/**
 * Languages the Farmess interface can be shown in. English is the language
 * the app is written in; every other language is a dictionary in
 * public/i18n/<code>.json, produced by scripts/translate-i18n.mjs.
 */
export type Language = {
  code: string;
  /** Name in English, used when asking for a translation. */
  name: string;
  /** Name in the language itself, shown in the language menu. */
  native: string;
  /** Script, to help the translator and to pick right-to-left text handling. */
  script: string;
  rtl?: boolean;
};

export const SOURCE_LANGUAGE = "en";

export const LANGUAGES: readonly Language[] = [
  { code: "en", name: "English", native: "English", script: "Latin" },
  { code: "hi", name: "Hindi", native: "हिन्दी", script: "Devanagari" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", script: "Gurmukhi" },
  { code: "ur", name: "Urdu", native: "اردو", script: "Perso-Arabic (Nastaliq)", rtl: true },
  { code: "doi", name: "Dogri", native: "डोगरी", script: "Devanagari" },
  { code: "ks", name: "Kashmiri", native: "کٲشُر", script: "Perso-Arabic", rtl: true },
  { code: "bn", name: "Bengali", native: "বাংলা", script: "Bengali" },
  { code: "mr", name: "Marathi", native: "मराठी", script: "Devanagari" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", script: "Gujarati" },
  { code: "ta", name: "Tamil", native: "தமிழ்", script: "Tamil" },
  { code: "te", name: "Telugu", native: "తెలుగు", script: "Telugu" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", script: "Kannada" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", script: "Malayalam" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", script: "Odia" },
  { code: "as", name: "Assamese", native: "অসমীয়া", script: "Bengali-Assamese" },
];

export function findLanguage(code: string | null | undefined): Language | null {
  return LANGUAGES.find((language) => language.code === code) ?? null;
}

export const LANGUAGE_STORAGE_KEY = "farmess.lang";
export const LANGUAGE_COOKIE = "farmess_lang";
