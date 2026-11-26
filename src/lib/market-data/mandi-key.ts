/**
 * AGMARKNET renames mandis over time (e.g. "Narwal Jammu (F&V) APMC" became
 * "MAC F&V Market Narwal Jammu"), which splits one mandi's price history into
 * several short pieces. mandiKey() gives the same key to such names so their
 * history can be joined:
 *  - generic words (APMC, F&V, market, fruit and vegetable, ...) are ignored;
 *  - the district's own name is ignored ("Parimpore Srinagar" = "Parimpore");
 *  - small spelling differences are tolerated by comparing consonant skeletons
 *    ("Batingoo" = "Batengoo").
 */

const GENERIC = new Set([
  "apmc",
  "mac",
  "f",
  "v",
  "fv",
  "market",
  "markets",
  "fruit",
  "fruits",
  "and",
  "vegetable",
  "vegetables",
  "mandi",
  "yard",
  "main",
  "sub",
  "the",
  "of",
  "committee",
]);

function words(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** First letter, then consonants only, with repeats collapsed. */
function skeleton(word: string): string {
  const rest = word.slice(1).replace(/[aeiouy]/g, "");
  return (word[0] + rest).replace(/(.)\1+/g, "$1");
}

export function mandiKey(marketName: string, district?: string | null): string {
  const districtWords = new Set(district ? words(district) : []);
  const significant = words(marketName).filter((w) => !GENERIC.has(w) && !districtWords.has(w));
  const chosen = significant.length ? significant : [...districtWords];
  return chosen.map(skeleton).join(" ") || marketName.trim().toLowerCase();
}
