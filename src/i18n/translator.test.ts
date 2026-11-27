import assert from "node:assert/strict";
import test from "node:test";

import { createTranslator, isUsableTranslation, placeholdersOf } from "./translator.ts";

const translate = createTranslator({
  strings: {
    "Sign in": "साइन इन करें",
    "My Produce": "मेरी उपज",
    pending: "लंबित",
    quintal: "क्विंटल",
    "Loading…": "लोड हो रहा है…",
  },
  templates: {
    "{0} sale(s). A sale starts when an offer is accepted.":
      "{0} बिक्री। प्रस्ताव स्वीकार होने पर बिक्री शुरू होती है।",
    "You rated the {0} {1} out of 5.": "आपने {0} को 5 में से {1} दिए।",
    "Request is {0}": "अनुरोध {0} है",
    "Rated {1} by {0}": "{0} ने {1} दिया",
    "{0} x": "",
  },
});

test("whole strings are translated and surrounding spaces are kept", () => {
  assert.equal(translate("Sign in"), "साइन इन करें");
  assert.equal(translate("  Sign in "), "  साइन इन करें ");
  assert.equal(translate("My\n   Produce"), "मेरी उपज");
});

test("text that is not in the dictionary is left alone", () => {
  assert.equal(translate("Ramesh Kumar"), null);
  assert.equal(translate("₹2,142"), null);
  assert.equal(translate("27"), null);
  assert.equal(translate(""), null);
  assert.equal(translate("x".repeat(700)), null);
});

test("templates carry changing values into the translation", () => {
  assert.equal(
    translate("3 sale(s). A sale starts when an offer is accepted."),
    "3 बिक्री। प्रस्ताव स्वीकार होने पर बिक्री शुरू होती है।",
  );
  assert.equal(translate("You rated the buyer 4 out of 5."), "आपने buyer को 5 में से 4 दिए।");
});

test("a value that is itself interface text is translated inside a template", () => {
  assert.equal(translate("Request is pending"), "अनुरोध लंबित है");
});

test("gaps may change order in the translation", () => {
  assert.equal(translate("Rated 5 by Asha"), "Asha ने 5 दिया");
});

test("repeated lookups give the same answer", () => {
  assert.equal(translate("Loading…"), "लोड हो रहा है…");
  assert.equal(translate("Loading…"), "लोड हो रहा है…");
  assert.equal(translate("Unknown text"), null);
  assert.equal(translate("Unknown text"), null);
});

test("a translation must keep the same placeholders", () => {
  assert.deepEqual(placeholdersOf("{1} of {0}"), ["{0}", "{1}"]);
  assert.equal(isUsableTranslation("Sell by {0}", "{0} तक बेचें"), true);
  assert.equal(isUsableTranslation("Sell by {0}", "तक बेचें"), false);
  assert.equal(isUsableTranslation("Sell by {0}", "{0} {1}"), false);
  assert.equal(isUsableTranslation("Sign in", "  "), false);
  assert.equal(isUsableTranslation("Sign in", 5), false);
});
