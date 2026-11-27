// Builds src/i18n/catalog.json: every user-visible English string found in the
// app source (JSX text, UI attributes, and string literals/templates that look
// like sentences or labels), plus the fixed lists in src/i18n/extra-strings.json
// (statuses, units, notification texts), the commodity names and the states.
//
// The in-page translator (src/i18n/translator.ts) matches rendered text against
// this catalog, so components need no changes when a language is added.
//
// Run from the farmess folder:   node scripts/extract-i18n-catalog.mjs
// Then translate what is new:    node scripts/translate-i18n.mjs
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = "src";
const OUT = "src/i18n/catalog.json";
const EXTRAS = "src/i18n/extra-strings.json";
/**
 * JSX attributes whose values are never shown to people. Every other attribute
 * (placeholder, title, aria-label, and the text props of our own components
 * such as hiddenHint or who) may hold copy.
 */
const HIDDEN_ATTRIBUTE = new RegExp(
  "^(className|class|href|id|key|src|style|type|name|htmlFor|role|rel|target|method|action|" +
    "autoComplete|inputMode|d|viewBox|fill|stroke|strokeWidth|strokeDasharray|strokeLinecap|" +
    "strokeLinejoin|points|transform|lang|dir|icon|variant|tone|as|value|defaultValue|list|" +
    "pattern|accept|idPrefix|labelClassName|labelTextClassName|selectClassName|textAnchor|" +
    "fontSize|x|y|x1|x2|y1|y2|cx|cy|r|width|height|xmlns|contextType|audience|" +
    "data-[a-z-]+|aria-(?!label$)[a-z]+)$",
);
const SKIP_DIRS = new Set(["i18n", "supabase"]);
/** Long data lists that are handled separately (see the end of this file). */
const SKIP_FILES = new Set([
  path.join("src", "lib", "location", "india.ts"),
  path.join("src", "lib", "location", "ogd-district-names.ts"),
  path.join("src", "lib", "market-data", "commodities.ts"),
]);

const ENTITIES = {
  apos: "'",
  quot: '"',
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rarr: "→",
  larr: "←",
  middot: "·",
  times: "×",
  deg: "°",
  rupee: "₹",
};

/** JSX text keeps HTML entities as written; the browser shows the characters. */
function decodeEntities(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (match, name) => ENTITIES[name] ?? match);
}

/** Collapse whitespace the way the browser does for rendered text. */
const squash = (value) => value.replace(/\s+/g, " ").trim();

function looksLikeCopy(text) {
  if (text.length < 2 || text.length > 400) return false;
  if (!/[A-Za-z]{2}/.test(text)) return false;
  // Skip code-like literals: paths, identifiers, CSS, URLs, MIME types, SQL-ish column lists.
  if (
    /^[a-z0-9_.:/\-[\]#,=()*%@]+$/i.test(text) &&
    !/\s/.test(text) &&
    !/^[A-Z][a-z]+$/.test(text)
  ) {
    return false;
  }
  if (/^(https?:|\/|\.\/|@\/|#)/.test(text)) return false;
  if (/^[a-z]+(-[a-z0-9]+)+( [a-z]+(-[a-z0-9]+)*)*$/.test(text)) return false; // class lists
  if (/^[a-z_]+(,[a-z_]+)+$/.test(text)) return false; // column lists
  // Code, not copy: braces, arrows, markup, or a semicolon that is not followed by a space
  // (prose may contain "...automatically; nobody has to import anything").
  if (/[{}]|=>|\bfunction\b|<\/?[a-z][^>]*>|;(?!\s)/i.test(text)) return false;
  if (/^(use client|use server|server-only)$/.test(text)) return false;
  return true;
}

const strings = new Set();
const templates = new Set();

function addString(raw) {
  const text = squash(raw);
  if (looksLikeCopy(text)) strings.add(text);
}

function addTemplateText(raw) {
  const text = squash(raw);
  const staticPart = text.replace(/\{\d+\}/g, "");
  // CSS class names built from parts ("lot-status lot-status-" + status) are not copy.
  if (/^[a-z0-9\- ]+$/.test(staticPart) && staticPart.includes("-")) return;
  // "{0} access" counts (a word next to a gap); "{0}px" or "id-{0}" does not.
  if (
    /\{\d+\}/.test(text) &&
    looksLikeCopy(staticPart) &&
    // Too little fixed text ("the {0}") would match text people typed themselves.
    staticPart.replace(/[^A-Za-z]/g, "").length >= 4 &&
    /[A-Za-z]{3}/.test(staticPart) &&
    /\s/.test(text)
  ) {
    templates.add(text);
  }
}

/** Template literal -> "text {0} more text" with numbered holes. */
function addTemplate(node) {
  let out = node.head.text;
  node.templateSpans.forEach((span, i) => {
    out += `{${i}}` + span.literal.text;
  });
  addTemplateText(out);
}

/** "a " + x + " b" -> "a {0} b" (only when some part is literal text). */
function flattenConcat(node, parts) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    flattenConcat(node.left, parts);
    flattenConcat(node.right, parts);
  } else if (ts.isParenthesizedExpression(node)) {
    flattenConcat(node.expression, parts);
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    parts.push({ text: node.text });
  } else if (ts.isTemplateExpression(node)) {
    parts.push({ text: node.head.text });
    for (const span of node.templateSpans) {
      parts.push({ hole: true });
      parts.push({ text: span.literal.text });
    }
  } else {
    parts.push({ hole: true });
  }
}

function addConcat(node) {
  const parts = [];
  flattenConcat(node, parts);
  if (!parts.some((part) => part.hole) || !parts.some((part) => part.text)) return;
  let hole = 0;
  let out = "";
  let lastWasHole = false;
  for (const part of parts) {
    if (part.hole) {
      if (!lastWasHole) out += `{${hole++}}`;
      lastWasHole = true;
    } else {
      out += part.text;
      if (part.text) lastWasHole = false;
    }
  }
  addTemplateText(out);
}

/**
 * True when the node sits inside a JSX attribute that is not shown to people
 * (className, href, id, ...), however deeply nested in the attribute's expression.
 */
function inHiddenAttribute(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isJsxAttribute(current)) return HIDDEN_ATTRIBUTE.test(current.name.getText());
    if (
      ts.isJsxElement(current) ||
      ts.isJsxSelfClosingElement(current) ||
      ts.isJsxFragment(current) ||
      ts.isFunctionLike(current) ||
      ts.isBlock(current)
    ) {
      return false;
    }
  }
  return false;
}

function isCopyPosition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (inHiddenAttribute(node)) return false;
  if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent)) return false;
  if (ts.isJsxAttribute(parent)) return !HIDDEN_ATTRIBUTE.test(parent.name.getText());
  if (ts.isCallExpression(parent)) {
    const callee = parent.expression.getText();
    // Arguments to data/DOM APIs are identifiers, not copy.
    if (
      /(^|\.)(from|select|eq|in|order|rpc|get|set|has|includes|startsWith|endsWith|test|match|replace|split|join|getItem|setItem|addEventListener|removeEventListener|querySelector|querySelectorAll|createElement|getAttribute|setAttribute|ilike|not|gte|lte|contains|upsert|insert|update|delete|range|limit|append|searchParams\.\w+|format|toLocaleString|localeCompare|push|redirect|replaceAll|slice|indexOf|withApiLogging|require|fetch|Number|String|Boolean|parseInt|encodeURIComponent|logEvent|assign|createHmac|digest)$/.test(
        callee,
      )
    ) {
      return false;
    }
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node) {
    const key = parent.name.getText().replace(/['"]/g, "");
    if (
      /^(href|icon|id|key|kind|type|role|status|method|className|class|style|name|value|unit|event_key|related_type|source|file|path|url|src|editor|mode|variant|tsType|rate_basis|service_type|cache|credentials|headers|locale|timeZone|day|month|year|hour|minute|currency|dateStyle|timeStyle|as|rel|target|htmlFor|autoComplete|inputMode|content|hindi|scope|sameSite|trigger|reason|action|code|referrer|runtime|dynamic|matcher|p_[a-z_]+)$/i.test(
        key,
      )
    ) {
      return false;
    }
  }
  if (ts.isBinaryExpression(parent)) {
    const op = parent.operatorToken.kind;
    if (
      op === ts.SyntaxKind.EqualsEqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
      op === ts.SyntaxKind.EqualsEqualsToken ||
      op === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      return false;
    }
  }
  if (ts.isCaseClause(parent) || ts.isLiteralTypeNode(parent) || ts.isTypeNode(parent))
    return false;
  if (ts.isElementAccessExpression(parent)) return false;
  return true;
}

function isTopOfConcat(node) {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
    !(
      node.parent &&
      (ts.isParenthesizedExpression(node.parent)
        ? ts.isBinaryExpression(node.parent.parent) &&
          node.parent.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
        : ts.isBinaryExpression(node.parent) &&
          node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)
    )
  );
}

function visit(node) {
  if (ts.isJsxText(node)) {
    addString(decodeEntities(node.text));
  } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    if (isCopyPosition(node)) addString(node.text);
  } else if (ts.isTemplateExpression(node)) {
    if (isCopyPosition(node)) addTemplate(node);
  }
  if (isTopOfConcat(node) && !inHiddenAttribute(node)) addConcat(node);
  ts.forEachChild(node, visit);
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
    } else if (
      /\.tsx?$/.test(entry.name) &&
      !/\.test\.tsx?$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts") &&
      !SKIP_FILES.has(full)
    ) {
      const source = ts.createSourceFile(
        full,
        fs.readFileSync(full, "utf8"),
        ts.ScriptTarget.Latest,
        true,
        entry.name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      );
      visit(source);
    }
  }
}

walk(ROOT);

// Fixed lists that never appear as literal text in a component.
const extras = JSON.parse(fs.readFileSync(EXTRAS, "utf8"));
for (const text of extras.strings ?? []) strings.add(squash(text));
for (const text of extras.templates ?? []) templates.add(squash(text));

// Commodity names (shown in search results, lots and forecasts).
const commodities = fs.readFileSync("src/lib/market-data/commodities.ts", "utf8");
const listBlock = commodities.slice(
  commodities.indexOf("export const COMMODITY_NAMES"),
  commodities.indexOf("];", commodities.indexOf("export const COMMODITY_NAMES")),
);
for (const match of listBlock.matchAll(/^\s*("(?:[^"\\]|\\.)*"),$/gm))
  strings.add(JSON.parse(match[1]));

// State and union-territory names (district names are left in English).
const india = fs.readFileSync("src/lib/location/india.ts", "utf8");
const districtsBlock = india.slice(
  india.indexOf("export const INDIA_DISTRICTS"),
  india.indexOf("export const INDIA_STATES"),
);
for (const match of districtsBlock.matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z]+)): \[/gm)) {
  strings.add(match[1] ?? match[2]);
}

const catalog = {
  version: 1,
  strings: [...strings].sort((a, b) => a.localeCompare(b)),
  templates: [...templates].sort((a, b) => a.localeCompare(b)),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(catalog, null, 2) + "\n");
const words = [...catalog.strings, ...catalog.templates].join(" ").split(/\s+/).length;
console.log(
  `strings ${catalog.strings.length}, templates ${catalog.templates.length}, words ${words}`,
);
