# Languages

The whole interface can be switched between English and 14 Indian languages from the language
menu (top bar, sign-in pages and the home page). The choice is remembered on the device.

Hindi, Punjabi, Urdu, Dogri, Kashmiri, Bengali, Marathi, Gujarati, Tamil, Telugu, Kannada,
Malayalam, Odia and Assamese. Each is listed in its own script, so someone who cannot read
English can still find theirs.

## How it works

Components are written in English and are not changed for translation.

1. `scripts/extract-i18n-catalog.mjs` reads the source code and collects every piece of text a
   person can see (text in components, placeholders and labels, messages returned by the API,
   plus fixed lists such as statuses, units, crop names, state names and notification texts)
   into `src/i18n/catalog.json`.
2. `scripts/translate-i18n.mjs` translates the catalog into each language and writes one
   dictionary per language to `public/i18n/<code>.json`.
3. In the browser, `src/i18n/runtime.ts` loads the chosen dictionary and replaces the text the
   page shows, including text that appears later. The English original of every piece is kept,
   so switching language needs no reload.

Text that is not in the dictionary is left exactly as it is. Names, numbers, prices, mandi and
district names, and anything a person typed (notes, messages, comments) are never altered.
Urdu and Kashmiri text reads right to left; the page layout itself stays the same.

## Adding or updating translations

```powershell
node scripts/extract-i18n-catalog.mjs
node scripts/translate-i18n.mjs
```

The second command sends only the strings that have no translation yet, so it is quick after a
small change and safe to stop and run again. `node scripts/translate-i18n.mjs hi pa` limits it
to some languages; `--check` only reports coverage.

It needs `GEMINI_API_KEY` in `.env.local` (a free key from Google AI Studio). The key is used
only by this script on a developer's machine. The running app does not use it and it must not
be added to Vercel. To add a language, add one line to `src/i18n/languages.ts` and run the
script.

## Honest limits

- **The translations are machine-made (Gemini) and have not yet been read by a speaker of each
  language.** They are good enough to navigate and understand the app; wording should be
  reviewed before relying on it for anything formal. Dogri and Kashmiri have the least written
  material online and are the most approximate. Corrections can be made directly in
  `public/i18n/<code>.json`.
- A sentence that the code builds from several pieces (for example a number in the middle) is
  translated piece by piece, so word order can be unnatural in places.
- Dates and month names stay in English form (27 Nov 2026); numerals are not changed.
- Text stored in the database by people (crop notes, offer terms, provider descriptions) is
  shown as written.
- Emails sent by the sign-in service are in English.
