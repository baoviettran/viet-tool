# Vietnamese Text Tool

A client-side web app for transforming Vietnamese text — removing accents, restoring accents, and expanding texting abbreviations. All processing runs in the browser with zero backend.

## Features

- **Remove Accents** — Strip Vietnamese diacritics (Tiếng Việt → Tieng Viet)
- **Add Accents** — Restore accents using Viterbi algorithm with bigram context (Tieng Viet → Tiếng Việt)
- **Expand Abbreviations** — Expand texting shorthand (k → không, j → gì, thik → thích)
- **Multiple interpretations** — Accent restoration shows top 3 results when ambiguous
- **English/Vietnamese UI** — Toggle between languages
- **Dark/Light theme** — Auto-detects OS preference with manual override

## How it works

### Accent restoration

The core algorithm uses **Viterbi dynamic programming** over a Hidden Markov Model at the syllable level. Each unaccented syllable has multiple possible accented forms (e.g., "la" → là/lá/lả/lã/lạ). The algorithm finds the most probable accented sequence using bigram frequency data from Vietnamese Wikipedia.

Key design decisions:
- **Syllable-level** processing (not word-level) — Vietnamese syllables are the atomic unit
- **Sentence splitting** — Text is split at true sentence boundaries (avoiding abbreviations, decimals, ellipsis) so bigram context resets correctly between sentences
- **K-best Viterbi** — Returns top 3 interpretations for ambiguous inputs
- **Web Worker** — Long inputs (>10 syllables) process off the main thread

### Abbreviation expansion

Two-phase approach: exact match via Trie lookup, then fuzzy fallback using Levenshtein distance (max 2 edits). Only expands when a single unambiguous match exists.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm test` | Run all tests |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |

## Building language data

The accent restoration engine uses syllable, unigram, and bigram data derived from Vietnamese Wikipedia:

```bash
npx tsx scripts/build-data.ts path/to/viwiki-latest-pages-articles.xml
```

This generates `src/data/syllables.json`, `unigrams.json`, and `bigrams.json`. Sample data is included for development.

## Tech stack

- React 19 + TypeScript + Vite
- Vitest + React Testing Library
- No UI framework — plain CSS with custom properties
- No backend — all processing in the browser

## License

MIT
