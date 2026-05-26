# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Vite dev server
npm test             # Run all tests (Vitest)
npm test -- tests/engines/addAccents.test.ts  # Run single test file
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
```

## Architecture

Client-side Vietnamese text tool with three transformation engines, a Web Worker, i18n, and theming. Zero backend.

### Engines (`src/engines/`)

The core of the project. Each engine is a pure module with no React dependencies.

**`addAccents.ts`** — The main engine. Uses Viterbi dynamic programming over a Hidden Markov Model at the **syllable level** (not word level — Vietnamese syllables are the atomic unit). Pipeline: `splitSentences()` → `processChunk()` → `tokenizeSyllables()` → `lookupCandidates()` → `kBestViterbi()`. Casing is handled separately from scoring — Viterbi scores against lowercase unigram/bigram keys, then `applyCasing()` restores original capitalization.

**`expandAbbrev.ts`** — Trie for exact abbreviation lookup + Levenshtein fuzzy fallback (max distance 2). Only expands if a single best match exists.

**`removeAccents.ts`** — Static character map, O(1) per character. Not perfectly reversible (đ→d loses information).

**`worker.ts`** — Web Worker that lazy-loads JSON data on first message. Uses typed `WorkerRequest`/`WorkerResponse` protocol from `types.ts`. `App.tsx` manages the worker lifecycle with a persistent worker and 5-minute idle timeout.

### Data (`src/data/`)

JSON files loaded at runtime. `syllables.json` maps unaccented → accented candidates. `unigrams.json`/`bigrams.json` are log-probability tables from a Wikipedia corpus. All keys are **lowercase** — the engines must lowercase before lookup and reapply casing after.

### React App

**`App.tsx`** holds all state and orchestrates engines. Uses `useRef` for persistent worker with idle timer. Inputs ≤10 syllables process synchronously; longer inputs go to the worker.

**Providers** (in `src/main.tsx`): `ThemeProvider` → `I18nProvider` → `App`. Theme uses CSS custom properties toggled via `data-theme` attribute on root. i18n is a custom context + hook with JSON locale files, no library.

**Components** (`src/components/`): Five components, all presentational. `TextOutput` owns the alternatives list internally — no separate component for it.

### Language data pipeline

`scripts/build-data.ts` converts a Vietnamese Wikipedia XML dump into `syllables.json`, `unigrams.json`, `bigrams.json`. Run with `npx tsx scripts/build-data.ts <dump.xml>`. Prunes bigrams with count < 3, applies Laplace smoothing, converts to log-probabilities.

## Testing

Vitest with jsdom. Tests are in `tests/` (mirrors `src/` structure). All engine tests use real sample data from `src/data/`. Component tests use `@testing-library/react`.

## Conventions

- **No Co-Authored-By in commits** — do not add Claude co-author trailing lines
- TypeScript strict mode with `verbatimModuleSyntax` — use `import type` for type-only imports
- No UI framework — plain CSS with custom properties in `src/App.css`
- One accent color with light/dark variants via CSS custom properties
