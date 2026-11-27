/**
 * Turns English interface text into another language using a dictionary.
 *
 * Two kinds of entries:
 *  - strings: whole pieces of text ("Sign in" -> "साइन इन करें");
 *  - templates: text with numbered gaps for values that change
 *    ("{0} sale(s)" matches "3 sale(s)"; the gap is carried into the translation).
 *
 * Text that is not in the dictionary is left exactly as it is, so names,
 * numbers and anything entered by people are never altered.
 */

export type Dictionary = {
  strings: Record<string, string>;
  templates: Record<string, string>;
};

export type Translate = (text: string) => string | null;

const MAX_LENGTH = 600;
const CACHE_LIMIT = 4_000;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CompiledTemplate = { pattern: RegExp; translation: string; weight: number };

function compileTemplates(templates: Record<string, string>): CompiledTemplate[] {
  const compiled: CompiledTemplate[] = [];
  for (const [source, translation] of Object.entries(templates)) {
    if (!translation) continue;
    const parts = source.split(/\{\d+\}/);
    const staticLength = parts.join("").trim().length;
    // A template that is almost all gap would match nearly anything.
    if (staticLength < 3) continue;
    const order = [...source.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]));
    const body = parts.map(escapeRegExp).join("([\\s\\S]+?)");
    compiled.push({
      pattern: new RegExp(`^${body}$`),
      // Gaps are captured in order of appearance; remember which number each one is.
      translation: translation.replace(
        /\{(\d+)\}/g,
        (_, n: string) => `\u0000${order.indexOf(Number(n))}\u0000`,
      ),
      weight: staticLength,
    });
  }
  // The most specific template (most fixed text) is tried first.
  return compiled.sort((a, b) => b.weight - a.weight);
}

export function createTranslator(dictionary: Dictionary): Translate {
  const strings = dictionary.strings ?? {};
  const templates = compileTemplates(dictionary.templates ?? {});
  const cache = new Map<string, string | null>();

  function core(text: string): string | null {
    const direct = strings[text];
    if (typeof direct === "string" && direct) return direct;
    for (const template of templates) {
      const match = template.pattern.exec(text);
      if (!match) continue;
      return template.translation.replace(/\u0000(\d+)\u0000/g, (_, index: string) => {
        const value = match[Number(index) + 1] ?? "";
        // A value that is itself interface text ("pending", "quintal") is translated too.
        return strings[value.trim()] ?? value;
      });
    }
    return null;
  }

  return (text) => {
    if (!text || text.length > MAX_LENGTH || !/[A-Za-z]/.test(text)) return null;
    const cached = cache.get(text);
    if (cached !== undefined) return cached;

    const lead = /^\s*/.exec(text)?.[0] ?? "";
    const tail = /\s*$/.exec(text.slice(lead.length))?.[0] ?? "";
    const inner = text.slice(lead.length, text.length - tail.length).replace(/\s+/g, " ");
    const translated = inner ? core(inner) : null;
    const result = translated === null ? null : `${lead}${translated}${tail}`;

    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(text, result);
    return result;
  };
}

/** Placeholders ({0}, {1}, ...) used in a piece of text, sorted. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{\d+\}/g)].map((match) => match[0]).sort();
}

/** A translation is usable only if it is non-empty and keeps exactly the same placeholders. */
export function isUsableTranslation(source: string, translation: unknown): translation is string {
  if (typeof translation !== "string" || !translation.trim()) return false;
  return placeholdersOf(source).join(",") === placeholdersOf(translation).join(",");
}
