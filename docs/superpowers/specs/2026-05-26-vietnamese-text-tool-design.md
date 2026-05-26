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
| `addAccents` | Restores accents using Viterbi DP over n-gram probabilities at the syllable level |
| `expandAbbreviations` | Expands texting shorthand using fixed dictionary + fuzzy fallback |
| Web Worker | Offloads heavy accent-restoration scoring off the main thread |

**Data flow:** User enters text → picks an action → transformer engine processes text (in Web Worker for accent restoration) → result displayed with typewriter animation. "Add Accents" returns up to 3 interpretations; user picks the correct one. Copy-to-clipboard button on output.

---

## Transformation Engines

### Remove Accents

Straightforward character mapping. Each accented Vietnamese character maps to its base Latin equivalent (e.g., `ắ` → `a`, `ồ` → `o`, `ậ` → `a`). Handles both uppercase and lowercase. Zero ambiguity. O(1) per character via `Map`.

**Note on `đ`:** The letter `đ` is a distinct letter in Vietnamese, not just a diacritical variant. `removeAccents` strips `đ → d`, but this is not perfectly reversible — `d` maps to many candidates (đ, d, đa, dá, dà...). The UI should note: "Removing accents is not perfectly reversible."

### Add Accents

Uses **Viterbi dynamic programming** over a Hidden Markov Model. Same algorithm as phone keyboard autocorrect — find the globally most probable accented sequence given unaccented input.

**Core insight:** Vietnamese syllables are the atomic unit. Every syllable has a fixed set of possible accented forms.

**Algorithm:**

```
Input:  "toi di choi"
Syllables:  ["toi", "di", "choi"]

Step 1 — Syllable tokenization
  Split input on whitespace into syllables.
  Non-Vietnamese tokens (numbers, URLs, punctuation) pass through unchanged.

Step 2 — Candidate lookup
  For each syllable, look up all possible accented forms from the dictionary:
    "toi" → [tôi, tối, tội, tỏi, tươi, tố, ...]
    "di"  → [đi, dị, di, dì, dí, dĩ]
    "choi" → [chơi, chói, chời, chọi, chỏi, ...]

Step 3 — Viterbi DP
  Model: HMM where hidden states = accented syllables, observations = unaccented syllables.
  Transition probabilities = bigram frequency P(syllable_i | syllable_{i-1})
  Emission probabilities = uniform (each accented form maps to exactly one unaccented form)

  For each position i (left to right):
    For each candidate c at position i:
      score[i][c] = max over all candidates p at position i-1 of:
        score[i-1][p] + log(P(c | p))

  Backtrack from the best final score to recover the optimal path.

  Complexity: O(T * N²) where T = number of syllables, N = max candidates per syllable.
  For Vietnamese: T ≈ 10-50 per sentence, N ≈ 2-10 → very fast.

Step 4 — K-best paths
  Use k-best Viterbi (List Viterbi / Huang's algorithm) to find the top 3
  globally-best paths in a single pass. At each position, track the K best
  partial paths to each candidate. This produces genuinely different
  interpretations, unlike naive "ban and re-run" which yields near-identical
  results that differ by only one syllable.

  Algorithm: extend each Viterbi cell to store the top K scores and backpointers.
  At position i, for each candidate c, maintain a sorted list of K incoming paths
  from position i-1. Merge-sort across all candidates to get global top K.
  Complexity: O(T * N² * K) — still very fast for K=3, N≤10, T≤50.
```

**Scoring model (bigram + unigram backoff):**

```
Score for transition from syllable s_{i-1} to s_i:

  if bigram P(s_i | s_{i-1}) exists:
    use bigram log-probability
  else:
    use unigram log-probability P(s_i) with Laplace smoothing
```

Trigrams are excluded from the initial build. If accuracy testing shows bigrams alone are insufficient, trigrams can be added as a future enhancement.

**Multi-answer output:** The engine returns the top 3 interpretations ranked by Viterbi score. "toi la ban" → #1 "tôi là bạn" (I am your friend), #2 "tối la bạn" (less likely), #3 etc. User picks the correct one for their context.

**Sentence splitting:** Input text is split into sentences using a context-aware boundary detector before processing. The detector avoids splitting on:
- **Abbreviations** — known Vietnamese and English abbreviations (TS., Dr., Tp., etc.)
- **Single-letter initials** — e.g., "T. Nguyễn"
- **Decimal numbers** — e.g., "3.14"
- **Ellipsis** — e.g., "..."

Each sentence runs through Viterbi independently, so bigram context resets at true sentence boundaries. Results are reassembled by joining the ith-best result from each sentence, with scores summed across sentences.

**Short input handling (≤ 3 syllables):** Bigram context is too weak for very short inputs. For 1-syllable inputs, show all possible accented forms. For 2-3 syllable inputs, show the top 3 Viterbi results but flag them as "low confidence" — the UI indicates these are best guesses with limited context.

### Expand Abbreviations

Two-phase approach:

1. **Exact match** — Look up word in abbreviation dictionary via a Trie (e.g., `k` → `không`, `j` → `gì`, `thik` → `thích`)
2. **Fuzzy fallback** — If no exact match, use Levenshtein distance to find the closest known abbreviation. Threshold of ≤ 2 edits to avoid false positives. If multiple candidates tie or distance > 2, skip expansion.

---

## Performance Strategy

**Data structures:**
- **Trie for abbreviation lookup** — O(n) lookup by word length, enables fast prefix-based fuzzy matching
- **Hash map for remove accents** — O(1) per character via `Map` of accented → base character
- **Syllable candidate map** — `Map<string, string[]>` mapping unaccented syllable to all valid accented forms. O(1) lookup.
- **N-gram probability tables** — Compact format: bigrams stored as `Map<string, Map<string, number>>` keyed by (previous_syllable → current_syllable → log-probability). O(1) lookup per transition.

**Accent restoration performance:**
- **Sentence splitting** — Text is split into sentences at punctuation boundaries before processing. Each sentence runs Viterbi independently. This ensures correct bigram context (no cross-sentence contamination) and bounds the Viterbi grid size per sentence.
- **Viterbi is O(T * N²)** — For T=20 syllables and N=8 max candidates, that's 1,280 operations per sentence. Effectively instant.
- **Single-syllable shortcut** — If a syllable has only 1 candidate, it collapses the Viterbi grid at that position (no branching). Many common syllables are unambiguous.
- **Short input fast path** — Inputs under 10 syllables process synchronously on the main thread (< 1ms). Only longer inputs go to the Web Worker.
- **Lazy-load n-gram data** — Load syllable candidate map and unigrams upfront. Lazy-load bigram table only when "Add accents" is first used.

**Text processing:**
- **Chunked processing** — For long text, split into sentences and process each independently via Viterbi in Web Worker
- **Web Worker** — Accent restoration for inputs > 10 syllables runs off the main thread

**Data size estimates (revised):**
- Syllable candidate map (~7,000 syllables × accent variants): ~50KB gzipped
- Unigram frequency table: ~20KB gzipped
- Bigram table (top 500K most frequent pairs): ~500KB-1MB gzipped (lazy-loaded)
- Abbreviation dictionary: ~5-10KB gzipped
- Total initial load: under 100KB gzipped (syllable map + unigrams + abbreviations)
- Lazy-loaded on first "Add accents" use: ~500KB-1MB (bigrams)

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
│  │                   │  │  Output (best)    │      │
│  │   Input           │→ │                   │      │
│  │                   │  ├──────────────────┤      │
│  │                   │  │ ▸ Show 2 alternatives │  │
│  └──────────────────┘  └──────────────────┘      │
│                         [ Copy selected ]          │
│  [ Remove Accents ]  [ Add Accents ]              │
│  [ Expand Abbreviations ]                         │
│                                                   │
└──────────────────────────────────────────────────┘
```

### i18n

Minimal client-side i18n with JSON translation objects. No library.
- Toggle button in header switches between English and Vietnamese
- Persists choice to `localStorage`
- Translates all user-facing text: UI labels, button text, headings, placeholders, tooltips, and error messages
- User input/output text is never touched
- Two locale files: `en.json` and `vi.json` (~30-40 strings each including error messages)
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
├── scripts/
│   └── build-data.ts           # Build script: Wikipedia dump → syllables/unigrams/bigrams JSON
├── src/
│   ├── components/
│   │   ├── Header.tsx          # Title, diacritic animation, i18n + theme toggles
│   │   ├── TextInput.tsx       # Input textarea
│   │   ├── TextOutput.tsx      # Output display + copy button. Owns the alternatives list internally.
│   │   ├── ActionBar.tsx       # Transform action buttons
│   │   └── CopyButton.tsx      # Copy to clipboard with feedback
│   ├── engines/
│   │   ├── removeAccents.ts    # Character mapping, O(1) per char
│   │   ├── addAccents.ts       # K-best Viterbi DP with bigram scoring
│   │   ├── expandAbbrev.ts     # Trie-based exact + fuzzy abbreviation expansion
│   │   └── worker.ts           # Web Worker for accent restoration
│   ├── data/
│   │   ├── syllables.json      # Syllable candidate map: unaccented → [accented forms]
│   │   ├── unigrams.json       # Syllable unigram frequency table
│   │   ├── bigrams.json        # Bigram frequency table (lazy-loaded)
│   │   └── abbreviations.json  # Texting abbreviation mappings
│   ├── i18n/
│   │   ├── en.json             # English UI strings (includes error messages)
│   │   ├── vi.json             # Vietnamese UI strings (includes error messages)
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
- Syllable-level processing (not word-level) — Vietnamese syllables are the atomic unit
- Viterbi DP for accent restoration — O(T * N²), finds globally optimal path
- K-best Viterbi (Huang's algorithm) for multi-interpretation — single pass, genuinely different alternatives
- N-gram backoff scoring: bigram → unigram with Laplace smoothing (no trigrams in initial build)
- Bigram data lazy-loaded via dynamic `import()` when "Add accents" is first used
- Web Worker built via Vite's worker import syntax (`new Worker(new URL('./worker.ts', import.meta.url))`)
- `syllables.json`, `unigrams.json`, and `abbreviations.json` bundled directly (small enough)

---

## Data Sourcing

All language data is built from a **Vietnamese Wikipedia dump** using a build script (`scripts/build-data.ts`).

**Build pipeline:**
1. Download the latest Vietnamese Wikipedia XML dump from `dumps.wikimedia.org/viwiki/`
2. Parse articles, strip markup, normalize text to NFC Unicode
3. Split text into syllables (whitespace tokenization, filter to valid Vietnamese syllables using a character regex)
4. Build syllable candidate map: group all observed accented syllables by their unaccented form
5. Count unigram frequencies (how often each accented syllable appears)
6. Count bigram frequencies (how often syllable B follows syllable A)
7. Prune: keep only bigrams with count ≥ 3 to reduce noise and file size
8. Convert raw counts to log-probabilities with Laplace smoothing
9. Output `syllables.json`, `unigrams.json`, `bigrams.json`

The build script runs as a one-time Node.js process. The output JSON files are committed to the repo — no build step needed at runtime. If accuracy is insufficient, the pipeline can be re-run with different thresholds or additional corpus sources.

**Abbreviation dictionary** (`abbreviations.json`) is hand-curated. ~100-200 common Vietnamese texting abbreviations with their expansions.

---

## Web Worker Protocol

The Web Worker handles accent restoration for inputs > 10 syllables.

**Message interface:**

```typescript
// Main thread → Worker
type WorkerRequest =
  | { type: 'ADD_ACCENTS'; id: string; payload: { syllables: string[]; k: number } }

// Worker → Main thread
type WorkerResponse =
  | { type: 'RESULT'; id: string; payload: { results: string[]; scores: number[] } }
  | { type: 'ERROR'; id: string; payload: { message: string } }

// Worker loads bigram data on first ADD_ACCENTS message, then keeps it in memory.
// Each message includes an `id` to match responses to requests.
```

**Worker lifecycle:**
1. Worker is created on first "Add Accents" click
2. On first message, lazy-loads bigram data (posts progress if needed)
3. Subsequent messages reuse loaded data — no reload
4. Worker is terminated if idle for > 5 minutes (recreated on next use)

---

## Error Handling & Edge Cases

**Input edge cases:**
- Empty input — buttons disabled, no action
- Mixed language — only transform Vietnamese characters/words, leave other languages untouched
- Already accented input — "Add Accents" detects already-accented words and skips them
- Numbers, punctuation, URLs — pass through unchanged

**Engine edge cases:**
- Unknown syllable — if an unaccented syllable has no dictionary entry, pass it through unchanged (non-Vietnamese word, proper noun, or slang). Viterbi skips that position.
- Single syllable input — skip Viterbi, return all possible accented forms as alternatives (no context to disambiguate)
- Already accented input — detect Vietnamese diacritical marks per syllable. Only run Viterbi on unaccented syllables, pass accented ones through as fixed.
- Fuzzy match too ambiguous — if Levenshtein distance > 2 or multiple candidates tie, skip abbreviation expansion
- Very long text — split into sentences at punctuation boundaries, run Viterbi independently per sentence (implemented)

**Browser edge cases:**
- Clipboard API unavailable — fallback to `document.execCommand('copy')` with hidden textarea
- Web Worker unsupported — process on main thread with chunked `requestIdleCallback` fallback
- localStorage blocked — theme and language default to OS/browser settings
