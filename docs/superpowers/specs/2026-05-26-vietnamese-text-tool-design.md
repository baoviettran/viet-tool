# Vietnamese Text Tool — Design Spec

## Overview

A client-side web app for transforming Vietnamese text: removing accents, restoring accents, and expanding texting abbreviations. Zero backend, all processing runs in the browser.

**Stack:** React + TypeScript + Vite. No UI framework. No backend.

**Target users:** General users who need quick Vietnamese text conversion.

---

## Architecture

Single-page React app. All Vietnamese language data (dictionaries, n-grams, abbreviation mappings) is bundled as JSON and loaded at startup.

**Core modules:**

| Module | Responsibility |
|--------|---------------|
| `removeAccents` | Strips diacritics from Vietnamese text (deterministic character mapping) |
| `addAccents` | Restores accents using n-gram probability matching against a word dictionary |
| `expandAbbreviations` | Expands texting shorthand using fixed dictionary + fuzzy fallback |
| Web Worker | Offloads heavy accent-restoration scoring off the main thread |

**Data flow:** User enters text → picks an action → transformer engine processes text (in Web Worker for accent restoration) → result displayed with typewriter animation. Copy-to-clipboard button on output.

---

## Transformation Engines

### Remove Accents

Straightforward character mapping. Each accented Vietnamese character maps to its base Latin equivalent (e.g., `ắ` → `a`, `ồ` → `o`, `ậ` → `a`). Handles both uppercase and lowercase. Zero ambiguity. O(1) per character via `Map`.

### Add Accents

Three-step pipeline:

1. **Lookup** — For each unaccented word, find all possible accented forms from the dictionary (e.g., "la" → [là, lá, lả, lã, lạ, la])
2. **Score** — Use bigram/trigram frequency data to score each candidate based on surrounding words. "toi la" → "tôi là" scores higher than "tôi lá" because "tôi là" is a more common bigram.
3. **Select** — Pick the highest-scoring candidate per word.

### Expand Abbreviations

Two-phase approach:

1. **Exact match** — Look up word in abbreviation dictionary via a Trie (e.g., `k` → `không`, `j` → `gì`, `thik` → `thích`)
2. **Fuzzy fallback** — If no exact match, use Levenshtein distance to find the closest known abbreviation. Threshold of ≤ 2 edits to avoid false positives. If multiple candidates tie or distance > 2, skip expansion.

---

## Performance Strategy

**Data structures:**
- **Trie for abbreviation lookup** — O(n) lookup by word length, enables fast prefix-based fuzzy matching
- **Hash map for remove accents** — O(1) per character via `Map` of accented → base character
- **Pre-indexed n-gram tables** — Nested `Map<string, Map<string, number>>` for O(1) probability lookups

**Accent restoration speedups:**
- **Memoization** — Cache resolved words within a single text so repeated words skip re-scoring
- **Early pruning** — If a word has only one accented form in the dictionary, skip n-gram scoring entirely
- **Lazy-load n-gram data** — Load core word dictionary upfront (~50KB gzipped), lazy-load bigram/trigram tables only when "Add accents" is first used

**Text processing:**
- **Chunked processing** — For long text, split into sentences and process sequentially in Web Worker
- **Web Worker** — Heavy accent-restoration scoring runs off the main thread

**Data size targets:**
- Word dictionary: ~50-100KB gzipped
- Bigram table: ~100-200KB gzipped (lazy-loaded)
- Trigram table: ~100-200KB gzipped (lazy-loaded)
- Abbreviation dictionary: ~5-10KB gzipped
- Total initial load: under 150KB gzipped

---

## UI Design

### Aesthetic: Typographic Workshop

The tool is about transforming Vietnamese text — typography itself is the design hero. A typesetter's workbench: functional, precise, with a craftsman's attention to detail. Vietnamese diacritics are visually rich and celebrated in the design.

**Tone:** Warm minimalism with typographic personality.

**Design choices:**

| Element | Choice |
|---------|--------|
| Fonts | Vietnamese-supporting serif for headings (e.g., Playfair Display, Source Serif) paired with JetBrains Mono for text areas. Contrast between editorial serif and functional mono. |
| Color (light) | Background `#faf8f5` (warm off-white), text `#1a1a1a` (ink-black), accent `#c23616` (vermillion — inspired by red Vietnamese seal stamps), muted warm grays for borders |
| Color (dark) | Background `#121212` (deep charcoal), surface `#1e1e1e` (text areas), text `#e8e4df` (warm off-white), accent `#e85d3a` (lighter vermillion), borders `#2e2e2e` |
| Texture | Subtle paper-like grain overlay. Darker and more subtle in dark mode. |
| Layout | Two-panel on desktop: input left, output right. Stacked on mobile. Generous padding. Asymmetric header with a large cycling diacritic character as decorative element. |
| Motion | Output text animates character-by-character (typewriter reveal) for short texts. Long texts skip animation. Button press has subtle ink-press feel (slight scale + opacity shift). |
| Differentiator | Header diacritic cycles through accented characters (ắ → ồ → ệ → ưỡ → ỉ) with smooth morph animation. The memorable detail someone screenshots. |

No UI framework dependencies. Plain CSS with custom properties. Google Fonts via `<link>`.

### Layout

```
┌──────────────────────────────────────────────────┐
│                                                   │
│   ắ  Vietnamese Text Tool          [EN/VI] [☽]  │
│      Transform accents & abbreviations            │
│                                                   │
│  ┌──────────────────┐  ┌──────────────────┐      │
│  │                   │  │                   │      │
│  │   Input           │  │   Output          │      │
│  │                   │→ │                   │      │
│  │                   │  │                   │      │
│  └──────────────────┘  └──────────────────┘      │
│                         [ Copy ]                   │
│  [ Remove Accents ]  [ Add Accents ]              │
│  [ Expand Abbreviations ]                         │
│                                                   │
└──────────────────────────────────────────────────┘
```

### i18n

Minimal client-side i18n with JSON translation objects. No library.
- Toggle button in header switches between English and Vietnamese
- Persists choice to `localStorage`
- Translates UI labels only (button text, headings, placeholders, tooltips). User input/output text is never touched
- Two locale files: `en.json` and `vi.json` (~20-30 strings each)
- React context with `useTranslation` hook

### Theme (Dark Mode)

- Auto-detect OS preference via `prefers-color-scheme` on first visit
- Sun/moon icon toggle in header to override
- Override persists in `localStorage`, takes priority over OS preference
- All colors defined as CSS custom properties — theme switch swaps a class on root element
- No layout changes between themes

---

## File Structure

```
vietnamese-tool/
├── public/
├── src/
│   ├── components/
│   │   ├── Header.tsx          # Title, diacritic animation, i18n + theme toggles
│   │   ├── TextInput.tsx       # Input textarea
│   │   ├── TextOutput.tsx      # Output textarea + copy button
│   │   ├── ActionBar.tsx       # Transform action buttons
│   │   └── CopyButton.tsx      # Copy to clipboard with feedback
│   ├── engines/
│   │   ├── removeAccents.ts    # Character mapping, O(1) per char
│   │   ├── addAccents.ts       # N-gram scoring pipeline
│   │   ├── expandAbbrev.ts     # Trie-based exact + fuzzy abbreviation expansion
│   │   └── worker.ts           # Web Worker for heavy processing
│   ├── data/
│   │   ├── words.json          # Vietnamese word dictionary with accent variants
│   │   ├── bigrams.json        # Bigram frequency table
│   │   ├── trigrams.json       # Trigram frequency table
│   │   └── abbreviations.json  # Texting abbreviation mappings
│   ├── i18n/
│   │   ├── en.json             # English UI strings
│   │   ├── vi.json             # Vietnamese UI strings
│   │   └── useTranslation.tsx  # React context + hook
│   ├── theme/
│   │   └── ThemeProvider.tsx    # OS detect + localStorage + toggle
│   ├── App.tsx
│   ├── App.css                 # All styles with CSS custom properties
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

**Key decisions:**
- TypeScript throughout for type safety on dictionary lookups and n-gram tables
- N-gram data lazy-loaded via dynamic `import()` when "Add accents" is first used
- Web Worker built via Vite's worker import syntax (`new Worker(new URL('./worker.ts', import.meta.url))`)
- `words.json` and `abbreviations.json` bundled directly (small enough)

---

## Error Handling & Edge Cases

**Input edge cases:**
- Empty input — buttons disabled, no action
- Mixed language — only transform Vietnamese characters/words, leave other languages untouched
- Already accented input — "Add Accents" detects already-accented words and skips them
- Numbers, punctuation, URLs — pass through unchanged

**Engine edge cases:**
- Unknown word — if unaccented word has no dictionary entry, leave it as-is
- Fuzzy match too ambiguous — if Levenshtein distance > 2 or multiple candidates tie, skip expansion
- Very long text — Web Worker processes in sentence chunks, shows progress for texts > 1000 characters

**Browser edge cases:**
- Clipboard API unavailable — fallback to `document.execCommand('copy')` with hidden textarea
- Web Worker unsupported — process on main thread with chunked `requestIdleCallback` fallback
- localStorage blocked — theme and language default to OS/browser settings
