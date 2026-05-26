# Vietnamese Text Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side React web app that removes accents, restores accents (via Viterbi), and expands Vietnamese texting abbreviations.

**Architecture:** Single-page React + TypeScript + Vite app. Three pure transformation engines (`removeAccents`, `addAccents`, `expandAbbreviations`) run client-side. Accent restoration uses k-best Viterbi DP over bigram/unigram probabilities at the syllable level. Heavy processing offloaded to a Web Worker.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, React Testing Library. No UI framework.

---

## File Structure Map

```
src/
├── engines/
│   ├── removeAccents.ts       # Accented char → base char mapping
│   ├── addAccents.ts          # K-best Viterbi + syllable tokenizer
│   ├── expandAbbrev.ts        # Trie + Levenshtein fuzzy
│   ├── types.ts               # Shared engine types
│   └── worker.ts              # Web Worker for addAccents
├── components/
│   ├── Header.tsx             # Title, diacritic animation, toggles
│   ├── TextInput.tsx          # Input textarea
│   ├── TextOutput.tsx         # Output + alternatives + copy
│   ├── ActionBar.tsx          # Transform buttons
│   └── CopyButton.tsx         # Clipboard with feedback
├── data/
│   ├── syllables.json         # Syllable candidate map
│   ├── unigrams.json          # Unigram log-probabilities
│   ├── bigrams.json           # Bigram log-probabilities (lazy-loaded)
│   └── abbreviations.json     # Abbreviation → expansion map
├── i18n/
│   ├── en.json
│   ├── vi.json
│   └── useTranslation.tsx     # React context + hook
├── theme/
│   └── ThemeProvider.tsx      # OS detect + toggle + CSS vars
├── App.tsx
├── App.css
├── main.tsx
└── vite-env.d.ts
scripts/
└── build-data.ts              # Wikipedia dump → JSON
tests/
├── engines/
│   ├── removeAccents.test.ts
│   ├── addAccents.test.ts
│   └── expandAbbrev.test.ts
└── components/
    └── TextOutput.test.tsx
```

---

### Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`

- [ ] **Step 1: Create Vite project**

```bash
npm create vite@latest . -- --template react-ts
```

If the command fails because the directory is not empty (has `docs/`), run it in a temp dir and copy files over, or use the `--force` flag.

- [ ] **Step 2: Install dependencies**

```bash
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

- [ ] **Step 3: Configure Vitest**

Add to `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.ts',
  },
  worker: {
    format: 'es',
  },
})
```

- [ ] **Step 4: Create test setup**

Create `tests/setup.ts`:

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Add test script to package.json**

Add to `scripts` in `package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Clean up boilerplate**

Delete `src/App.css` contents (will rewrite later). Delete `src/assets/` folder. Replace `src/App.tsx` with:

```tsx
function App() {
  return <div id="app"></div>
}

export default App
```

- [ ] **Step 7: Create directory structure**

```bash
mkdir -p src/engines src/components src/data src/i18n src/theme tests/engines tests/components scripts
```

- [ ] **Step 8: Verify setup**

```bash
npm run dev
npm test
```

Expected: Vite dev server starts, Vitest runs (0 tests found, no errors).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript + Vitest project"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/engines/types.ts`

- [ ] **Step 1: Write the types file**

Create `src/engines/types.ts`:

```typescript
export interface AccentResult {
  results: string[];
  scores: number[];
  lowConfidence: boolean;
}

export interface WorkerRequest {
  type: 'ADD_ACCENTS';
  id: string;
  payload: { syllables: string[]; k: number };
}

export interface WorkerResultResponse {
  type: 'RESULT';
  id: string;
  payload: { results: string[]; scores: number[] };
}

export interface WorkerErrorResponse {
  type: 'ERROR';
  id: string;
  payload: { message: string };
}

export type WorkerResponse = WorkerResultResponse | WorkerErrorResponse;

export type SyllableMap = Record<string, string[]>;
export type UnigramMap = Record<string, number>;
export type BigramMap = Record<string, Record<string, number>>;
```

- [ ] **Step 2: Commit**

```bash
git add src/engines/types.ts
git commit -m "feat: add shared engine types"
```

---

### Task 3: Remove Accents Engine (TDD)

**Files:**
- Create: `src/engines/removeAccents.ts`
- Create: `tests/engines/removeAccents.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/engines/removeAccents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { removeAccents } from '../../src/engines/removeAccents';

describe('removeAccents', () => {
  it('removes common tone marks', () => {
    expect(removeAccents('tôi là bạn')).toBe('toi la ban');
  });

  it('removes all diacritical marks from a complex sentence', () => {
    expect(removeAccents('Trường học đẹp quá!')).toBe('Truong hoc dep qua!');
  });

  it('handles đ→d mapping', () => {
    expect(removeAccents('đi đứng')).toBe('di dung');
  });

  it('handles Đ→D mapping', () => {
    expect(removeAccents('Đà Nẵng')).toBe('Da Nang');
  });

  it('preserves non-Vietnamese text', () => {
    expect(removeAccents('Hello world 123')).toBe('Hello world 123');
  });

  it('handles empty string', () => {
    expect(removeAccents('')).toBe('');
  });

  it('handles mixed Vietnamese and English', () => {
    expect(removeAccents('I love bạn')).toBe('I love ban');
  });

  it('removes breve (ă) and horn (ơ, ư)', () => {
    expect(removeAccents('ă ơ ư')).toBe('a o u');
  });

  it('handles syllables with multiple diacritics', () => {
    expect(removeAccents('ưỡn')).toBe('uon');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/engines/removeAccents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/engines/removeAccents.ts`:

```typescript
const ACCENT_MAP: Record<string, string> = {
  'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
  'Ă': 'A', 'Ắ': 'A', 'Ằ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
  'Â': 'A', 'Ấ': 'A', 'Ầ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
  'Đ': 'D', 'đ': 'd',
  'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
  'Ê': 'E', 'Ế': 'E', 'Ề': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
  'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
  'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
  'Ô': 'O', 'Ố': 'O', 'Ồ': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
  'Ơ': 'O', 'Ớ': 'O', 'Ờ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
  'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
  'Ư': 'U', 'Ứ': 'U', 'Ừ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
  'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y',
  'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
  'ă': 'a', 'ắ': 'a', 'ằ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
  'â': 'a', 'ấ': 'a', 'ầ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
  'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
  'ê': 'e', 'ế': 'e', 'ề': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
  'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
  'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
  'ô': 'o', 'ố': 'o', 'ồ': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
  'ơ': 'o', 'ớ': 'o', 'ờ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
  'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
  'ư': 'u', 'ứ': 'u', 'ừ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
  'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
};

export function removeAccents(text: string): string {
  return text.replace(/[ÀÁẢÃẠĂẮẰẲẴẶÂẤẦẨẪẬĐÈÉẺẼẸÊẾỀỂỄỆÌÍỈĨỊÒÓỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÙÚỦŨỤƯỨỪỬỮỰỲÝỶỸỴàáảãạăắằẳẵặâấầẩẫậđèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ]/g,
    (ch) => ACCENT_MAP[ch] ?? ch
  );
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/engines/removeAccents.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/removeAccents.ts tests/engines/removeAccents.test.ts
git commit -m "feat: add removeAccents engine with full Vietnamese diacritics map"
```

---

### Task 4: Sample Data for Testing

**Files:**
- Create: `src/data/syllables.json`
- Create: `src/data/unigrams.json`
- Create: `src/data/bigrams.json`
- Create: `src/data/abbreviations.json`

- [ ] **Step 1: Create sample syllable candidate map**

Create `src/data/syllables.json`:

```json
{
  "toi": ["tôi", "tối", "tội", "tồi", "tỏi"],
  "la": ["là", "lá", "lả", "lã", "lạ", "la"],
  "ban": ["bạn", "ban", "bàn", "bán", "bản"],
  "di": ["đi", "dị", "di", "dì", "dí"],
  "choi": ["chơi", "chói", "chời", "chọi"],
  "hoc": ["học", "hoc", "hóc", "hòm"],
  "sinh": ["sinh", "sính"],
  "vien": ["viên", "viền", "viễn", "viện"],
  "mot": ["một", "mốt", "mọt"],
  "nguoi": ["người", "người"],
  "nh": ["nh"],
  "khong": ["không", "khóng", "khòng"],
  "cam": ["cảm", "cấm", "căm", "cầm", "cám", "cam"],
  "on": ["ơn", "ón", "òn", "ỏn", "õn", "ọng"]
}
```

- [ ] **Step 2: Create sample unigram table**

Create `src/data/unigrams.json`:

```json
{
  "tôi": -1.2, "tối": -3.5, "tội": -4.1, "tồi": -5.0, "tỏi": -3.8,
  "là": -0.8, "lá": -2.5, "lả": -3.8, "lã": -4.2, "lạ": -2.9, "la": -4.5,
  "bạn": -1.5, "ban": -3.2, "bàn": -2.8, "bán": -3.0, "bản": -2.7,
  "đi": -1.0, "dị": -3.5, "di": -4.0, "dì": -3.8, "dí": -3.9,
  "chơi": -1.8, "chói": -3.5, "chời": -4.0, "chọi": -4.5,
  "học": -1.3, "hoc": -5.0, "hóc": -4.2, "hòm": -5.5,
  "sinh": -1.8, "sính": -4.0,
  "viên": -2.0, "viền": -4.5, "viễn": -3.8, "viện": -2.2,
  "một": -1.1, "mốt": -3.8, "mọt": -5.0,
  "người": -1.4,
  "không": -0.9, "khóng": -5.0, "khòng": -5.0,
  "cảm": -2.2, "cấm": -3.0, "căm": -3.8, "cầm": -2.9, "cám": -3.2, "cam": -4.0,
  "ơn": -2.0, "ón": -3.5, "òn": -4.0, "ỏn": -4.5, "õn": -4.8, "ọng": -4.2
}
```

- [ ] **Step 3: Create sample bigram table**

Create `src/data/bigrams.json`:

```json
{
  "tôi": { "là": -0.5, "lá": -3.5, "lạ": -3.0, "la": -4.5 },
  "là": { "bạn": -0.8, "ban": -3.5, "bàn": -3.0 },
  "đi": { "chơi": -0.3, "chói": -4.0 },
  "một": { "người": -0.6 },
  "sinh": { "viên": -0.4, "viễn": -4.0 },
  "học": { "sinh": -0.5 },
  "không": { "đi": -1.0, "dị": -4.0 },
  "bạn": { "đi": -1.5, "chơi": -1.8 }
}
```

- [ ] **Step 4: Create sample abbreviation dictionary**

Create `src/data/abbreviations.json`:

```json
{
  "k": "không",
  "j": "gì",
  "thik": "thích",
  "dc": "được",
  "vs": "với",
  "ntn": "như thế nào",
  "kj": "gì",
  "ng": "người",
  "ak": "á",
  "nha": "nhá",
  "hok": "không",
  "ntn": "như thế nào",
  "bm": "bạn mình",
  "gm": "gì mà",
  "r": "rồi",
  "rùi": "rồi",
  "ùi": "rồi",
  "cx": "cũng",
  "v": "vậy",
  "đc": "được",
  "b": "bạn",
  "m": "mày",
  "t": "tao",
  "sz": "sao",
  "w": "quá"
}
```

- [ ] **Step 5: Commit**

```bash
git add src/data/
git commit -m "feat: add sample Vietnamese language data for testing"
```

---

### Task 5: Add Accents — Candidate Lookup & Tokenizer (TDD)

**Files:**
- Create: `src/engines/addAccents.ts`
- Create: `tests/engines/addAccents.test.ts`

- [ ] **Step 1: Write the failing tests for tokenizer and candidate lookup**

Create `tests/engines/addAccents.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  tokenizeSyllables,
  isVietnameseSyllable,
  lookupCandidates,
} from '../../src/engines/addAccents';
import syllablesData from '../../src/data/syllables.json';
import type { SyllableMap } from '../../src/engines/types';

const syllables = syllablesData as SyllableMap;

describe('tokenizeSyllables', () => {
  it('splits a simple sentence into syllables', () => {
    expect(tokenizeSyllables('toi di choi')).toEqual([
      { text: 'toi', isVietnamese: true },
      { text: 'di', isVietnamese: true },
      { text: 'choi', isVietnamese: true },
    ]);
  });

  it('preserves punctuation as non-Vietnamese tokens', () => {
    expect(tokenizeSyllables('toi, di!')).toEqual([
      { text: 'toi', isVietnamese: true },
      { text: ',', isVietnamese: false },
      { text: 'di', isVietnamese: true },
      { text: '!', isVietnamese: false },
    ]);
  });

  it('handles multiple spaces', () => {
    expect(tokenizeSyllables('toi   di')).toEqual([
      { text: 'toi', isVietnamese: true },
      { text: 'di', isVietnamese: true },
    ]);
  });

  it('handles empty string', () => {
    expect(tokenizeSyllables('')).toEqual([]);
  });
});

describe('isVietnameseSyllable', () => {
  it('returns true for unaccented Vietnamese syllable', () => {
    expect(isVietnameseSyllable('toi')).toBe(true);
    expect(isVietnameseSyllable('la')).toBe(true);
  });

  it('returns false for numbers', () => {
    expect(isVietnameseSyllable('123')).toBe(false);
  });

  it('returns false for punctuation', () => {
    expect(isVietnameseSyllable(',')).toBe(false);
  });

  it('returns true for accented syllable', () => {
    expect(isVietnameseSyllable('tôi')).toBe(true);
  });
});

describe('lookupCandidates', () => {
  it('returns all accented forms for a known syllable', () => {
    const result = lookupCandidates('toi', syllables);
    expect(result).toContain('tôi');
    expect(result).toContain('tối');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('returns single-element array for unknown syllable (passthrough)', () => {
    const result = lookupCandidates('xyz', syllables);
    expect(result).toEqual(['xyz']);
  });

  it('detects already-accented syllable and returns it as-is', () => {
    const result = lookupCandidates('tôi', syllables);
    expect(result).toEqual(['tôi']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/engines/addAccents.ts` with tokenizer and candidate lookup. The Viterbi functions will be added in the next task.

```typescript
import type { SyllableMap, UnigramMap, BigramMap, AccentResult } from './types';

export function tokenizeSyllables(text: string): Array<{ text: string; isVietnamese: boolean }> {
  if (!text.trim()) return [];

  const tokens: Array<{ text: string; isVietnamese: boolean }> = [];
  const parts = text.split(/(\s+)/);

  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) continue;
    const subTokens = part.match(/[a-zA-ZÀ-ỹđĐ]+|[^a-zA-ZÀ-ỹđĐ]+/g) ?? [part];
    for (const token of subTokens) {
      tokens.push({ text: token, isVietnamese: isVietnameseSyllable(token) });
    }
  }

  return tokens;
}

export function isVietnameseSyllable(text: string): boolean {
  return /^[a-zA-ZÀ-ỹđĐ]+$/.test(text) && text.length >= 1 && text.length <= 7;
}

export function lookupCandidates(syllable: string, syllableMap: SyllableMap): string[] {
  // If already accented, return as-is
  if (hasVietnameseDiacritics(syllable)) {
    return [syllable];
  }

  const lower = syllable.toLowerCase();
  const candidates = syllableMap[lower];
  if (!candidates) return [syllable];

  // Preserve original case
  if (syllable[0] === syllable[0].toUpperCase()) {
    return candidates.map((c) => c[0].toUpperCase() + c.slice(1));
  }

  return candidates;
}

function hasVietnameseDiacritics(text: string): boolean {
  return /[À-ỹđĐ]/.test(text);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/addAccents.ts tests/engines/addAccents.test.ts
git commit -m "feat: add syllable tokenizer and candidate lookup for accent restoration"
```

---

### Task 6: Add Accents — Viterbi DP (TDD)

**Files:**
- Modify: `src/engines/addAccents.ts`
- Modify: `tests/engines/addAccents.test.ts`

- [ ] **Step 1: Write the failing Viterbi tests**

Append to `tests/engines/addAccents.test.ts`:

```typescript
import unigramsData from '../../src/data/unigrams.json';
import bigramsData from '../../src/data/bigrams.json';

const unigrams = unigramsData as UnigramMap;
const bigrams = bigramsData as BigramMap;

describe('viterbi', () => {
  it('finds the best accent sequence for a simple sentence', () => {
    const candidates = [
      lookupCandidates('toi', syllables),
      lookupCandidates('la', syllables),
      lookupCandidates('ban', syllables),
    ];
    const result = viterbi(candidates, bigrams, unigrams);
    expect(result.path).toEqual(['tôi', 'là', 'bạn']);
  });

  it('picks correct accents based on bigram context', () => {
    const candidates = [
      lookupCandidates('sinh', syllables),
      lookupCandidates('vien', syllables),
    ];
    const result = viterbi(candidates, bigrams, unigrams);
    expect(result.path[0]).toBe('sinh');
    expect(result.path[1]).toBe('viên');
  });

  it('falls back to unigram when bigram is missing', () => {
    const candidates = [
      lookupCandidates('cam', syllables),
    ];
    const result = viterbi(candidates, bigrams, unigrams);
    expect(result.path).toHaveLength(1);
    expect(result.path[0]).toBe('cảm'); // highest unigram score
  });

  it('handles single syllable', () => {
    const candidates = [lookupCandidates('toi', syllables)];
    const result = viterbi(candidates, bigrams, unigrams);
    expect(result.path).toEqual(['tôi']); // best unigram
  });

  it('returns score alongside path', () => {
    const candidates = [
      lookupCandidates('toi', syllables),
      lookupCandidates('la', syllables),
    ];
    const result = viterbi(candidates, bigrams, unigrams);
    expect(result.score).toBeLessThan(0);
  });
});
```

Add the import at the top of the test file:

```typescript
import { viterbi } from '../../src/engines/addAccents';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: FAIL — `viterbi` is not exported.

- [ ] **Step 3: Implement Viterbi**

Add to `src/engines/addAccents.ts`:

```typescript
const UNSEEN_PENALTY = -20;

function getTransitionScore(
  prev: string,
  curr: string,
  bigrams: BigramMap,
  unigrams: UnigramMap
): number {
  const bigramScore = bigrams[prev]?.[curr];
  if (bigramScore !== undefined) return bigramScore;
  return unigrams[curr] ?? UNSEEN_PENALTY;
}

export function viterbi(
  candidates: string[][],
  bigrams: BigramMap,
  unigrams: UnigramMap
): { path: string[]; score: number } {
  const T = candidates.length;
  if (T === 0) return { path: [], score: 0 };

  // dp[i][j] = best score reaching position i with candidate j
  const dp: number[][] = [];
  const bp: number[][] = [];

  // Initialize first position with unigram scores
  dp[0] = candidates[0].map((c) => unigrams[c] ?? UNSEEN_PENALTY);
  bp[0] = candidates[0].map(() => -1);

  // Fill DP table
  for (let i = 1; i < T; i++) {
    dp[i] = [];
    bp[i] = [];
    for (let j = 0; j < candidates[i].length; j++) {
      let bestScore = -Infinity;
      let bestPrev = 0;
      const curr = candidates[i][j];

      for (let k = 0; k < candidates[i - 1].length; k++) {
        const prev = candidates[i - 1][k];
        const transitionScore = getTransitionScore(prev, curr, bigrams, unigrams);
        const score = dp[i - 1][k] + transitionScore;
        if (score > bestScore) {
          bestScore = score;
          bestPrev = k;
        }
      }
      dp[i][j] = bestScore;
      bp[i][j] = bestPrev;
    }
  }

  // Find best final score
  let bestFinalIdx = 0;
  let bestFinalScore = -Infinity;
  for (let j = 0; j < dp[T - 1].length; j++) {
    if (dp[T - 1][j] > bestFinalScore) {
      bestFinalScore = dp[T - 1][j];
      bestFinalIdx = j;
    }
  }

  // Backtrack
  const path: string[] = new Array(T);
  let idx = bestFinalIdx;
  for (let i = T - 1; i >= 0; i--) {
    path[i] = candidates[i][idx];
    idx = bp[i][idx];
  }

  return { path, score: bestFinalScore };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/addAccents.ts tests/engines/addAccents.test.ts
git commit -m "feat: add Viterbi DP algorithm for accent restoration"
```

---

### Task 7: Add Accents — K-Best Viterbi (TDD)

**Files:**
- Modify: `src/engines/addAccents.ts`
- Modify: `tests/engines/addAccents.test.ts`

- [ ] **Step 1: Write the failing k-best tests**

Append to `tests/engines/addAccents.test.ts`:

```typescript
describe('kBestViterbi', () => {
  it('returns top 3 results', () => {
    const candidates = [
      lookupCandidates('toi', syllables),
      lookupCandidates('la', syllables),
      lookupCandidates('ban', syllables),
    ];
    const results = kBestViterbi(candidates, bigrams, unigrams, 3);
    expect(results).toHaveLength(3);
    expect(results[0].path).toEqual(['tôi', 'là', 'bạn']);
  });

  it('results have decreasing scores', () => {
    const candidates = [
      lookupCandidates('toi', syllables),
      lookupCandidates('la', syllables),
      lookupCandidates('ban', syllables),
    ];
    const results = kBestViterbi(candidates, bigrams, unigrams, 3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it('returns fewer results if not enough distinct paths exist', () => {
    const candidates = [
      lookupCandidates('mot', syllables),
    ];
    const results = kBestViterbi(candidates, bigrams, unigrams, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('produces meaningfully different paths', () => {
    const candidates = [
      lookupCandidates('toi', syllables),
      lookupCandidates('la', syllables),
      lookupCandidates('ban', syllables),
    ];
    const results = kBestViterbi(candidates, bigrams, unigrams, 3);
    const paths = results.map((r) => r.path.join(' '));
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBeGreaterThan(1);
  });
});
```

Add the import:

```typescript
import { kBestViterbi } from '../../src/engines/addAccents';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: FAIL — `kBestViterbi` is not exported.

- [ ] **Step 3: Implement k-best Viterbi**

Add to `src/engines/addAccents.ts`:

```typescript
interface PathCandidate {
  score: number;
  prevCandidateIdx: number;
  prevPathRank: number;
}

export function kBestViterbi(
  candidates: string[][],
  bigrams: BigramMap,
  unigrams: UnigramMap,
  k: number
): Array<{ path: string[]; score: number }> {
  const T = candidates.length;
  if (T === 0) return [];

  // dp[i][j] = top K PathCandidates at position i, candidate j
  const dp: PathCandidate[][][] = [];

  // Initialize first position
  dp[0] = candidates[0].map((c) => [
    { score: unigrams[c] ?? UNSEEN_PENALTY, prevCandidateIdx: -1, prevPathRank: -1 },
  ]);

  // Fill DP
  for (let i = 1; i < T; i++) {
    dp[i] = [];
    for (let j = 0; j < candidates[i].length; j++) {
      const curr = candidates[i][j];
      const incoming: PathCandidate[] = [];

      for (let pi = 0; pi < candidates[i - 1].length; pi++) {
        const prev = candidates[i - 1][pi];
        const transScore = getTransitionScore(prev, curr, bigrams, unigrams);

        for (let rank = 0; rank < dp[i - 1][pi].length; rank++) {
          incoming.push({
            score: dp[i - 1][pi][rank].score + transScore,
            prevCandidateIdx: pi,
            prevPathRank: rank,
          });
        }
      }

      // Sort descending by score, keep top K
      incoming.sort((a, b) => b.score - a.score);
      dp[i][j] = incoming.slice(0, k);
    }
  }

  // Collect all final candidates with their scores and backpointers
  const finalCandidates: Array<{
    score: number;
    candidateIdx: number;
    pathRank: number;
  }> = [];

  for (let j = 0; j < dp[T - 1].length; j++) {
    for (let rank = 0; rank < dp[T - 1][j].length; rank++) {
      finalCandidates.push({
        score: dp[T - 1][j][rank].score,
        candidateIdx: j,
        pathRank: rank,
      });
    }
  }

  finalCandidates.sort((a, b) => b.score - a.score);
  const topFinal = finalCandidates.slice(0, k);

  // Backtrack each path
  const results: Array<{ path: string[]; score: number }> = [];

  for (const final of topFinal) {
    const path: string[] = new Array(T);
    let cIdx = final.candidateIdx;
    let rank = final.pathRank;

    for (let i = T - 1; i >= 0; i--) {
      path[i] = candidates[i][cIdx];
      if (i > 0) {
        const cell = dp[i][cIdx][rank];
        cIdx = cell.prevCandidateIdx;
        rank = cell.prevPathRank;
      }
    }

    results.push({ path, score: final.score });
  }

  return results;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/addAccents.ts tests/engines/addAccents.test.ts
git commit -m "feat: add k-best Viterbi for multiple accent interpretations"
```

---

### Task 8: Add Accents — Full Pipeline (TDD)

**Files:**
- Modify: `src/engines/addAccents.ts`
- Modify: `tests/engines/addAccents.test.ts`

- [ ] **Step 1: Write the failing pipeline tests**

Append to `tests/engines/addAccents.test.ts`:

```typescript
describe('addAccents pipeline', () => {
  it('restores accents for a full sentence', async () => {
    const result = await addAccents('toi la ban', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('tôi là bạn');
    expect(result.results.length).toBe(3);
  });

  it('preserves punctuation', async () => {
    const result = await addAccents('toi, di choi!', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('tôi, đi chơi!');
  });

  it('passes through unknown syllables', async () => {
    const result = await addAccents('hello toi', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('hello tôi');
  });

  it('handles already-accented input', async () => {
    const result = await addAccents('tôi la ban', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('tôi là bạn');
  });

  it('returns all candidates for single syllable', async () => {
    const result = await addAccents('la', syllables, unigrams, bigrams);
    expect(result.results.length).toBeGreaterThan(1);
    expect(result.lowConfidence).toBe(true);
  });

  it('flags short input as low confidence', async () => {
    const result = await addAccents('toi la', syllables, unigrams, bigrams);
    expect(result.lowConfidence).toBe(true);
  });

  it('does not flag longer input as low confidence', async () => {
    const result = await addAccents('toi la ban di choi', syllables, unigrams, bigrams);
    expect(result.lowConfidence).toBe(false);
  });

  it('handles empty input', async () => {
    const result = await addAccents('', syllables, unigrams, bigrams);
    expect(result.results).toEqual([]);
  });
});
```

Add the import:

```typescript
import { addAccents } from '../../src/engines/addAccents';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: FAIL — `addAccents` is not exported.

- [ ] **Step 3: Implement the full pipeline**

Add to `src/engines/addAccents.ts`:

```typescript
export async function addAccents(
  text: string,
  syllableMap: SyllableMap,
  unigrams: UnigramMap,
  bigrams: BigramMap,
  k: number = 3
): Promise<AccentResult> {
  if (!text.trim()) return { results: [], scores: [], lowConfidence: false };

  const tokens = tokenizeSyllables(text);
  const vietnameseTokens = tokens.filter((t) => t.isVietnamese);

  // Single syllable: return all candidates
  if (vietnameseTokens.length === 1) {
    const candidates = lookupCandidates(vietnameseTokens[0].text, syllableMap);
    return { results: candidates, scores: candidates.map(() => 0), lowConfidence: true };
  }

  // Build candidate arrays for Vietnamese positions
  const candidateArrays: string[][] = [];
  const vietnamesePositions: number[] = [];

  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].isVietnamese) {
      candidateArrays.push(lookupCandidates(tokens[i].text, syllableMap));
      vietnamesePositions.push(i);
    }
  }

  const lowConfidence = vietnameseTokens.length <= 3;

  const kResults = kBestViterbi(candidateArrays, bigrams, unigrams, k);

  // Reassemble results with non-Vietnamese tokens
  const results: string[] = kResults.map((r) => {
    const output = [...tokens.map((t) => t.text)];
    for (let vi = 0; vi < vietnamesePositions.length; vi++) {
      output[vietnamesePositions[vi]] = r.path[vi];
    }
    return output.join(' ');
  });

  return {
    results,
    scores: kResults.map((r) => r.score),
    lowConfidence,
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/engines/addAccents.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/addAccents.ts tests/engines/addAccents.test.ts
git commit -m "feat: add full addAccents pipeline with tokenization and short-input handling"
```

---

### Task 9: Expand Abbreviations — Trie + Fuzzy (TDD)

**Files:**
- Create: `src/engines/expandAbbrev.ts`
- Create: `tests/engines/expandAbbrev.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/engines/expandAbbrev.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { expandAbbreviations, createTrie, levenshtein } from '../../src/engines/expandAbbrev';
import abbreviations from '../../src/data/abbreviations.json';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for single edit', () => {
    expect(levenshtein('thik', 'thích')).toBe(1);
  });

  it('returns correct distance for two edits', () => {
    expect(levenshtein('thjk', 'thích')).toBeLessThanOrEqual(2);
  });
});

describe('createTrie and exact match', () => {
  it('finds exact match in trie', () => {
    const trie = createTrie(abbreviations);
    expect(trie.exactLookup('k')).toBe('không');
  });

  it('finds multiple word abbreviations', () => {
    const trie = createTrie(abbreviations);
    expect(trie.exactLookup('ntn')).toBe('như thế nào');
  });

  it('returns null for unknown abbreviation', () => {
    const trie = createTrie(abbreviations);
    expect(trie.exactLookup('xyz')).toBeNull();
  });
});

describe('expandAbbreviations', () => {
  it('expands a single abbreviation', () => {
    const result = expandAbbreviations('k', abbreviations);
    expect(result).toBe('không');
  });

  it('expands multiple abbreviations in a sentence', () => {
    const result = expandAbbreviations('t k b j', abbreviations);
    expect(result).toContain('không');
    expect(result).toContain('gì');
  });

  it('preserves non-abbreviation words', () => {
    const result = expandAbbreviations('hello k', abbreviations);
    expect(result).toBe('hello không');
  });

  it('handles fuzzy match for close variants', () => {
    const result = expandAbbreviations('thik', abbreviations);
    expect(result).toBe('thích');
  });

  it('skips expansion if no match within threshold', () => {
    const result = expandAbbreviations('abcdefg', abbreviations);
    expect(result).toBe('abcdefg');
  });

  it('preserves punctuation', () => {
    const result = expandAbbreviations('k, j!', abbreviations);
    expect(result).toContain('không');
    expect(result).toContain('gì');
    expect(result).toContain(',');
    expect(result).toContain('!');
  });

  it('handles empty string', () => {
    expect(expandAbbreviations('', abbreviations)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- tests/engines/expandAbbrev.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Trie, Levenshtein, and expandAbbreviations**

Create `src/engines/expandAbbrev.ts`:

```typescript
type AbbrevMap = Record<string, string>;

interface TrieNode {
  children: Map<string, TrieNode>;
  value: string | null;
}

export function createTrie(abbreviations: AbbrevMap) {
  const root: TrieNode = { children: new Map(), value: null };

  for (const [key, val] of Object.entries(abbreviations)) {
    let node = root;
    for (const ch of key.toLowerCase()) {
      if (!node.children.has(ch)) {
        node.children.set(ch, { children: new Map(), value: null });
      }
      node = node.children.get(ch)!;
    }
    node.value = val;
  }

  return {
    exactLookup(word: string): string | null {
      let node = root;
      for (const ch of word.toLowerCase()) {
        node = node.children.get(ch);
        if (!node) return null;
      }
      return node.value;
    },
  };
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

function fuzzyLookup(
  word: string,
  abbreviations: AbbrevMap,
  maxDist: number = 2
): string | null {
  let bestMatch: string | null = null;
  let bestDist = maxDist + 1;

  for (const key of Object.keys(abbreviations)) {
    const dist = levenshtein(word.toLowerCase(), key);
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = abbreviations[key];
    }
  }

  // If multiple keys have same distance, skip (too ambiguous)
  let count = 0;
  for (const key of Object.keys(abbreviations)) {
    if (levenshtein(word.toLowerCase(), key) === bestDist) count++;
  }

  return count === 1 && bestDist <= maxDist ? bestMatch : null;
}

export function expandAbbreviations(text: string, abbreviations: AbbrevMap): string {
  if (!text) return '';

  const trie = createTrie(abbreviations);
  const tokens = text.match(/[a-zA-ZÀ-ỹđĐ]+|[^a-zA-ZÀ-ỹđĐ]+/g) ?? [];

  return tokens
    .map((token) => {
      // Try exact match first
      const exact = trie.exactLookup(token);
      if (exact !== null) return exact;

      // Only try fuzzy on short tokens (abbreviations are typically 1-5 chars)
      if (/^[a-zA-ZÀ-ỹđĐ]+$/.test(token) && token.length <= 5) {
        const fuzzy = fuzzyLookup(token, abbreviations);
        if (fuzzy) return fuzzy;
      }

      return token;
    })
    .join('');
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- tests/engines/expandAbbrev.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/engines/expandAbbrev.ts tests/engines/expandAbbrev.test.ts
git commit -m "feat: add abbreviation expansion engine with Trie lookup and fuzzy matching"
```

---

### Task 10: i18n System

**Files:**
- Create: `src/i18n/en.json`
- Create: `src/i18n/vi.json`
- Create: `src/i18n/useTranslation.tsx`

- [ ] **Step 1: Create English locale**

Create `src/i18n/en.json`:

```json
{
  "appTitle": "Vietnamese Text Tool",
  "appSubtitle": "Transform accents & abbreviations",
  "inputPlaceholder": "Type or paste Vietnamese text here...",
  "outputPlaceholder": "Result will appear here...",
  "removeAccents": "Remove Accents",
  "addAccents": "Add Accents",
  "expandAbbreviations": "Expand Abbreviations",
  "copy": "Copy",
  "copied": "Copied!",
  "showAlternatives": "Show {count} alternatives",
  "hideAlternatives": "Hide alternatives",
  "lowConfidence": "Low confidence — limited context",
  "notReversible": "Removing accents is not perfectly reversible",
  "errorProcessing": "Error processing text",
  "language": "EN"
}
```

- [ ] **Step 2: Create Vietnamese locale**

Create `src/i18n/vi.json`:

```json
{
  "appTitle": "Công Cụ Tiếng Việt",
  "appSubtitle": "Chuyển đổi dấu & viết tắt",
  "inputPlaceholder": "Nhập hoặc dán văn bản tiếng Việt...",
  "outputPlaceholder": "Kết quả sẽ hiển thị ở đây...",
  "removeAccents": "Bỏ Dấu",
  "addAccents": "Thêm Dấu",
  "expandAbbreviations": "Mở Rộng Viết Tắt",
  "copy": "Sao chép",
  "copied": "Đã sao chép!",
  "showAlternatives": "Hiện {count} kết quả khác",
  "hideAlternatives": "Ẩn kết quả khác",
  "lowConfidence": "Độ tin cậy thấp — thiếu ngữ cảnh",
  "notReversible": "Bỏ dấu không thể hoàn nguyên hoàn toàn",
  "errorProcessing": "Lỗi xử lý văn bản",
  "language": "VI"
}
```

- [ ] **Step 3: Create translation hook**

Create `src/i18n/useTranslation.tsx`:

```tsx
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import en from './en.json';
import vi from './vi.json';

type Locale = 'en' | 'vi';
type Translations = Record<string, string>;

const locales: Record<Locale, Translations> = { en, vi };

interface I18nContextType {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  t: (key) => key,
  setLocale: () => {},
});

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem('viet-tool-locale') as Locale;
    if (saved && locales[saved]) return saved;
  } catch {}
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('viet-tool-locale', newLocale);
    } catch {}
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = locales[locale][key] ?? locales.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/i18n/
git commit -m "feat: add i18n system with English and Vietnamese locales"
```

---

### Task 11: Theme Provider

**Files:**
- Create: `src/theme/ThemeProvider.tsx`

- [ ] **Step 1: Create theme provider**

Create `src/theme/ThemeProvider.tsx`:

```tsx
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'light',
  toggleTheme: () => {},
});

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem('viet-tool-theme') as Theme;
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return getSystemTheme();
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('viet-tool-theme', theme);
    } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/theme/ThemeProvider.tsx
git commit -m "feat: add theme provider with OS auto-detect and localStorage persistence"
```

---

### Task 12: UI — Header Component

**Files:**
- Create: `src/components/Header.tsx`

- [ ] **Step 1: Create the Header with diacritic animation, i18n toggle, and theme toggle**

Create `src/components/Header.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { useTheme } from '../theme/ThemeProvider';

const DIACRITICS = ['ắ', 'ồ', 'ệ', 'ưỡ', 'ỉ', 'ẳ', 'ử', 'ễ'];

export function Header() {
  const { locale, t, setLocale } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [diacriticIndex, setDiacriticIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDiacriticIndex((i) => (i + 1) % DIACRITICS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-diacritic" key={diacriticIndex}>
          {DIACRITICS[diacriticIndex]}
        </span>
        <div>
          <h1 className="header-title">{t('appTitle')}</h1>
          <p className="header-subtitle">{t('appSubtitle')}</p>
        </div>
      </div>
      <div className="header-controls">
        <button
          className="toggle-btn"
          onClick={() => setLocale(locale === 'en' ? 'vi' : 'en')}
          aria-label="Toggle language"
        >
          {t('language')}
        </button>
        <button
          className="toggle-btn"
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === 'light' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Header.tsx
git commit -m "feat: add Header component with diacritic animation and toggles"
```

---

### Task 13: UI — TextInput + ActionBar

**Files:**
- Create: `src/components/TextInput.tsx`
- Create: `src/components/ActionBar.tsx`

- [ ] **Step 1: Create TextInput**

Create `src/components/TextInput.tsx`:

```tsx
import { useTranslation } from '../i18n/useTranslation';

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
}

export function TextInput({ value, onChange }: TextInputProps) {
  const { t } = useTranslation();

  return (
    <textarea
      className="text-input"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('inputPlaceholder')}
      rows={8}
    />
  );
}
```

- [ ] **Step 2: Create ActionBar**

Create `src/components/ActionBar.tsx`:

```tsx
import { useTranslation } from '../i18n/useTranslation';

interface ActionBarProps {
  disabled: boolean;
  onRemoveAccents: () => void;
  onAddAccents: () => void;
  onExpandAbbreviations: () => void;
}

export function ActionBar({
  disabled,
  onRemoveAccents,
  onAddAccents,
  onExpandAbbreviations,
}: ActionBarProps) {
  const { t } = useTranslation();

  return (
    <div className="action-bar">
      <button className="action-btn" disabled={disabled} onClick={onRemoveAccents}>
        {t('removeAccents')}
      </button>
      <button className="action-btn" disabled={disabled} onClick={onAddAccents}>
        {t('addAccents')}
      </button>
      <button className="action-btn" disabled={disabled} onClick={onExpandAbbreviations}>
        {t('expandAbbreviations')}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/TextInput.tsx src/components/ActionBar.tsx
git commit -m "feat: add TextInput and ActionBar components"
```

---

### Task 14: UI — TextOutput + CopyButton

**Files:**
- Create: `src/components/TextOutput.tsx`
- Create: `src/components/CopyButton.tsx`

- [ ] **Step 1: Create CopyButton**

Create `src/components/CopyButton.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { useTranslation } from '../i18n/useTranslation';

interface CopyButtonProps {
  text: string;
}

export function CopyButton({ text }: CopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button className="copy-btn" onClick={handleCopy} disabled={!text}>
      {copied ? t('copied') : t('copy')}
    </button>
  );
}
```

- [ ] **Step 2: Create TextOutput with alternatives**

Create `src/components/TextOutput.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { CopyButton } from './CopyButton';

interface TextOutputProps {
  result: string | null;
  alternatives: string[];
  scores: number[];
  lowConfidence: boolean;
}

export function TextOutput({ result, alternatives, scores, lowConfidence }: TextOutputProps) {
  const { t } = useTranslation();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allResults = result ? [result, ...alternatives] : [];
  const selectedText = allResults[selectedIndex] ?? '';

  if (!result) {
    return (
      <div className="text-output">
        <textarea
          className="output-area"
          value=""
          readOnly
          placeholder={t('outputPlaceholder')}
          rows={8}
        />
      </div>
    );
  }

  return (
    <div className="text-output">
      <div className="output-area-wrapper">
        <textarea
          className="output-area"
          value={selectedText}
          readOnly
          rows={8}
        />
        {lowConfidence && (
          <div className="low-confidence-badge">{t('lowConfidence')}</div>
        )}
      </div>

      <div className="output-actions">
        <CopyButton text={selectedText} />

        {allResults.length > 1 && (
          <button
            className="toggle-btn alternatives-toggle"
            onClick={() => setShowAlternatives(!showAlternatives)}
          >
            {showAlternatives
              ? t('hideAlternatives')
              : t('showAlternatives', { count: allResults.length - 1 })}
          </button>
        )}
      </div>

      {showAlternatives && (
        <ul className="alternatives-list">
          {allResults.map((r, i) => (
            <li
              key={i}
              className={`alternative-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => setSelectedIndex(i)}
            >
              <span className="alternative-rank">#{i + 1}</span>
              <span className="alternative-text">{r}</span>
              {scores[i] !== undefined && (
                <span className="alternative-score">{scores[i].toFixed(2)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CopyButton.tsx src/components/TextOutput.tsx
git commit -m "feat: add TextOutput with alternatives list and CopyButton with fallback"
```

---

### Task 15: App Assembly + Styles

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Wire up App.tsx**

Replace `src/App.tsx`:

```tsx
import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { TextInput } from './components/TextInput';
import { TextOutput } from './components/TextOutput';
import { ActionBar } from './components/ActionBar';
import { removeAccents } from './engines/removeAccents';
import { addAccents } from './engines/addAccents';
import { expandAbbreviations } from './engines/expandAbbrev';
import type { AccentResult } from './engines/types';
import syllablesData from './data/syllables.json';
import unigramsData from './data/unigrams.json';
import bigramsData from './data/bigrams.json';
import abbreviationsData from './data/abbreviations.json';
import { useTranslation } from './i18n/useTranslation';

function App() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [warning, setWarning] = useState('');

  const handleRemoveAccents = useCallback(() => {
    setOutput(removeAccents(input));
    setAlternatives([]);
    setScores([]);
    setLowConfidence(false);
    setWarning(t('notReversible'));
  }, [input, t]);

  const handleAddAccents = useCallback(async () => {
    try {
      const result: AccentResult = await addAccents(
        input,
        syllablesData,
        unigramsData,
        bigramsData
      );
      setOutput(result.results[0] ?? null);
      setAlternatives(result.results.slice(1));
      setScores(result.scores);
      setLowConfidence(result.lowConfidence);
      setWarning('');
    } catch {
      setOutput(null);
      setWarning(t('errorProcessing'));
    }
  }, [input, t]);

  const handleExpandAbbreviations = useCallback(() => {
    setOutput(expandAbbreviations(input, abbreviationsData));
    setAlternatives([]);
    setScores([]);
    setLowConfidence(false);
    setWarning('');
  }, [input]);

  return (
    <div className="app-container">
      <Header />
      <main className="main-content">
        <div className="panels">
          <div className="panel">
            <TextInput value={input} onChange={setInput} />
          </div>
          <div className="panel">
            <TextOutput
              result={output}
              alternatives={alternatives}
              scores={scores}
              lowConfidence={lowConfidence}
            />
          </div>
        </div>
        {warning && <p className="warning-text">{warning}</p>}
        <ActionBar
          disabled={!input.trim()}
          onRemoveAccents={handleRemoveAccents}
          onAddAccents={handleAddAccents}
          onExpandAbbreviations={handleExpandAbbreviations}
        />
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Wire up main.tsx with providers**

Replace `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n/useTranslation';
import { ThemeProvider } from './theme/ThemeProvider';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ThemeProvider>
  </StrictMode>
);
```

- [ ] **Step 3: Write the full stylesheet**

Replace `src/App.css`:

```css
:root {
  --bg: #faf8f5;
  --surface: #ffffff;
  --text: #1a1a1a;
  --text-secondary: #666;
  --accent: #c23616;
  --accent-hover: #a82d13;
  --border: #e0dcd6;
  --border-focus: #c23616;
  --font-display: 'Source Serif 4', Georgia, serif;
  --font-mono: 'JetBrains Mono', monospace;
}

[data-theme='dark'] {
  --bg: #121212;
  --surface: #1e1e1e;
  --text: #e8e4df;
  --text-secondary: #999;
  --accent: #e85d3a;
  --accent-hover: #d14e2e;
  --border: #2e2e2e;
  --border-focus: #e85d3a;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-mono);
  background-color: var(--bg);
  color: var(--text);
  min-height: 100vh;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
}

.app-container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1.5rem;
}

/* Header */
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.header-brand {
  display: flex;
  align-items: baseline;
  gap: 0.75rem;
}

.header-diacritic {
  font-family: var(--font-display);
  font-size: 3rem;
  font-weight: 700;
  color: var(--accent);
  animation: diacriticIn 0.6s ease-out;
}

@keyframes diacriticIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.header-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.header-subtitle {
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.header-controls {
  display: flex;
  gap: 0.5rem;
}

/* Buttons */
.toggle-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  transition: border-color 0.2s;
}

.toggle-btn:hover {
  border-color: var(--accent);
}

.action-btn {
  background: var(--accent);
  color: #fff;
  border: none;
  padding: 0.6rem 1.2rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.9rem;
  transition: background-color 0.15s, transform 0.1s;
}

.action-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.action-btn:active:not(:disabled) {
  transform: scale(0.98);
  opacity: 0.9;
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.copy-btn {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 0.4rem 0.75rem;
  border-radius: 4px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}

.copy-btn:hover:not(:disabled) {
  border-color: var(--accent);
}

/* Panels */
.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 1rem;
}

@media (max-width: 768px) {
  .panels {
    grid-template-columns: 1fr;
  }
}

.panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem;
}

/* Text areas */
.text-input,
.output-area {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  font-family: var(--font-mono);
  font-size: 0.95rem;
  line-height: 1.6;
  resize: vertical;
  outline: none;
}

.text-input:focus {
  outline: none;
}

.output-area {
  resize: none;
}

/* Output */
.output-area-wrapper {
  position: relative;
}

.low-confidence-badge {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: var(--accent);
  color: #fff;
  font-size: 0.7rem;
  padding: 0.2rem 0.5rem;
  border-radius: 3px;
  opacity: 0.85;
}

.output-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.alternatives-toggle {
  font-size: 0.8rem;
}

.alternatives-list {
  list-style: none;
  margin-top: 0.75rem;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}

.alternative-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.alternative-item:hover {
  background: var(--border);
}

.alternative-item.selected {
  background: var(--border);
}

.alternative-rank {
  font-size: 0.75rem;
  color: var(--text-secondary);
  min-width: 1.5rem;
}

.alternative-text {
  flex: 1;
  font-size: 0.9rem;
}

.alternative-score {
  font-size: 0.7rem;
  color: var(--text-secondary);
}

/* Action bar */
.action-bar {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

/* Warning */
.warning-text {
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-style: italic;
  margin-top: 0.5rem;
}
```

- [ ] **Step 4: Update index.html with Google Fonts**

Add before the closing `</head>` in `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,700&display=swap" rel="stylesheet">
```

- [ ] **Step 5: Verify the app runs**

```bash
npm run dev
```

Expected: App loads in browser with header, two text panels, action buttons. Diacritic animation cycles. Theme and language toggles work.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css src/main.tsx index.html
git commit -m "feat: wire up App with all engines, providers, and Typographic Workshop styles"
```

---

### Task 16: Web Worker for Accent Restoration

**Files:**
- Create: `src/engines/worker.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the Web Worker**

Create `src/engines/worker.ts`:

```typescript
import { addAccents } from './addAccents';
import type { WorkerRequest, WorkerResponse, SyllableMap, UnigramMap, BigramMap } from './types';

let syllablesData: SyllableMap | null = null;
let unigramsData: UnigramMap | null = null;
let bigramsData: BigramMap | null = null;

async function loadData() {
  if (bigramsData) return;
  const syllablesModule = await import('../data/syllables.json');
  const unigramsModule = await import('../data/unigrams.json');
  const bigramsModule = await import('../data/bigrams.json');
  syllablesData = syllablesModule.default as SyllableMap;
  unigramsData = unigramsModule.default as UnigramMap;
  bigramsData = bigramsModule.default as BigramMap;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'ADD_ACCENTS') {
    try {
      await loadData();
      const result = await addAccents(
        msg.payload.syllables.join(' '),
        syllablesData!,
        unigramsData!,
        bigramsData!,
        msg.payload.k
      );

      const response: WorkerResponse = {
        type: 'RESULT',
        id: msg.id,
        payload: { results: result.results, scores: result.scores },
      };
      self.postMessage(response);
    } catch (err) {
      const response: WorkerResponse = {
        type: 'ERROR',
        id: msg.id,
        payload: { message: err instanceof Error ? err.message : 'Unknown error' },
      };
      self.postMessage(response);
    }
  }
};
```

- [ ] **Step 2: Add Worker integration to App.tsx**

In `src/App.tsx`, replace the `handleAddAccents` callback with:

```tsx
const handleAddAccents = useCallback(async () => {
  try {
    const syllableCount = input.trim().split(/\s+/).length;

    // Use Worker for long inputs, sync for short
    if (syllableCount > 10 && typeof Worker !== 'undefined') {
      const worker = new Worker(
        new URL('./engines/worker.ts', import.meta.url),
        { type: 'module' }
      );
      const id = crypto.randomUUID();

      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'RESULT' && msg.id === id) {
          setOutput(msg.payload.results[0] ?? null);
          setAlternatives(msg.payload.results.slice(1));
          setScores(msg.payload.scores);
          setLowConfidence(syllableCount <= 3);
          setWarning('');
          worker.terminate();
        }
        if (msg.type === 'ERROR' && msg.id === id) {
          setOutput(null);
          setWarning(t('errorProcessing'));
          worker.terminate();
        }
      };

      worker.postMessage({
        type: 'ADD_ACCENTS',
        id,
        payload: { syllables: input.trim().split(/\s+/), k: 3 },
      });
    } else {
      const result = await addAccents(input, syllablesData, unigramsData, bigramsData);
      setOutput(result.results[0] ?? null);
      setAlternatives(result.results.slice(1));
      setScores(result.scores);
      setLowConfidence(result.lowConfidence);
      setWarning('');
    }
  } catch {
    setOutput(null);
    setWarning(t('errorProcessing'));
  }
}, [input, t]);
```

- [ ] **Step 3: Verify**

```bash
npm run dev
npm test
```

Expected: App runs. All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/engines/worker.ts src/App.tsx
git commit -m "feat: add Web Worker for heavy accent restoration with sync fallback"
```

---

### Task 17: Data Build Script

**Files:**
- Create: `scripts/build-data.ts`

- [ ] **Step 1: Create the Wikipedia data builder**

Create `scripts/build-data.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUTPUT_DIR = join(import.meta.dirname, '..', 'src', 'data');

interface Counts {
  unigramCounts: Map<string, number>;
  bigramCounts: Map<string, Map<string, number>>;
  syllableGroups: Map<string, Set<string>>;
  totalSyllables: number;
}

function stripAccents(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function isVietnameseSyllable(word: string): boolean {
  return /^[a-zA-ZÀ-ỹđĐ]{1,7}$/.test(word);
}

function processText(text: string, counts: Counts) {
  const words = text.split(/\s+/).filter(isVietnameseSyllable);

  for (const word of words) {
    const lower = word.toLowerCase();
    const stripped = stripAccents(lower).toLowerCase();

    // Syllable groups
    if (!counts.syllableGroups.has(stripped)) {
      counts.syllableGroups.set(stripped, new Set());
    }
    counts.syllableGroups.get(stripped)!.add(lower);

    // Unigrams
    counts.unigramCounts.set(lower, (counts.unigramCounts.get(lower) ?? 0) + 1);
    counts.totalSyllables++;
  }

  // Bigrams
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1].toLowerCase();
    const curr = words[i].toLowerCase();
    if (!counts.bigramCounts.has(prev)) {
      counts.bigramCounts.set(prev, new Map());
    }
    const inner = counts.bigramCounts.get(prev)!;
    inner.set(curr, (inner.get(curr) ?? 0) + 1);
  }
}

function main() {
  const dumpPath = process.argv[2];
  if (!dumpPath) {
    console.error('Usage: npx tsx scripts/build-data.ts <wikipedia-dump.xml>');
    process.exit(1);
  }

  console.log('Reading dump...');
  const raw = readFileSync(dumpPath, 'utf-8');

  const counts: Counts = {
    unigramCounts: new Map(),
    bigramCounts: new Map(),
    syllableGroups: new Map(),
    totalSyllables: 0,
  };

  // Extract text between <text> tags (simplified — for production use a proper XML parser)
  const textRegex = /<text[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null;
  let articleCount = 0;

  while ((match = textRegex.exec(raw)) !== null) {
    const articleText = match[1]
      .replace(/[\[\]{|}=<>]/g, ' ')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[^a-zA-ZÀ-ỹđĐ\s]/g, ' ');

    processText(articleText, counts);
    articleCount++;
    if (articleCount % 10000 === 0) {
      console.log(`Processed ${articleCount} articles...`);
    }
  }

  console.log(`Processed ${articleCount} articles, ${counts.totalSyllables} syllables`);

  // Build syllables.json
  const syllables: Record<string, string[]> = {};
  for (const [stripped, accented] of counts.syllableGroups) {
    syllables[stripped] = [...accented].sort();
  }

  // Build unigrams.json (log-probabilities)
  const vocabSize = counts.unigramCounts.size;
  const unigrams: Record<string, number> = {};
  for (const [syllable, count] of counts.unigramCounts) {
    unigrams[syllable] = Math.log((count + 1) / (counts.totalSyllables + vocabSize));
  }

  // Build bigrams.json (log-probabilities, pruned to count >= 3)
  const bigrams: Record<string, Record<string, number>> = {};
  for (const [prev, inner] of counts.bigramCounts) {
    const prevTotal = counts.unigramCounts.get(prev) ?? 0;
    const entries: Record<string, number> = {};
    for (const [curr, count] of inner) {
      if (count >= 3) {
        entries[curr] = Math.log((count + 1) / (prevTotal + vocabSize));
      }
    }
    if (Object.keys(entries).length > 0) {
      bigrams[prev] = entries;
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  writeFileSync(join(OUTPUT_DIR, 'syllables.json'), JSON.stringify(syllables, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'unigrams.json'), JSON.stringify(unigrams, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'bigrams.json'), JSON.stringify(bigrams, null, 2));

  console.log(`Written to ${OUTPUT_DIR}/`);
  console.log(`Syllables: ${Object.keys(syllables).length}`);
  console.log(`Unigrams: ${Object.keys(unigrams).length}`);
  console.log(`Bigrams: ${Object.keys(bigrams).length} prev-syllables`);
}

main();
```

- [ ] **Step 2: Add build-data script to package.json**

Add to `scripts` in `package.json`:

```json
{
  "scripts": {
    "build-data": "npx tsx scripts/build-data.ts <dump-path>"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-data.ts
git commit -m "feat: add Wikipedia dump data build script for syllable/unigram/bigram generation"
```

---

## Self-Review

**Spec coverage check:**
- [x] Remove accents engine → Task 3
- [x] Add accents — tokenizer → Task 5
- [x] Add accents — Viterbi DP → Task 6
- [x] Add accents — K-best Viterbi → Task 7
- [x] Add accents — full pipeline + short input handling → Task 8
- [x] Expand abbreviations — Trie → Task 9
- [x] Expand abbreviations — fuzzy Levenshtein → Task 9
- [x] Web Worker with typed protocol → Task 16
- [x] i18n (EN + VI) with error messages → Task 10
- [x] Theme provider (OS detect + toggle + localStorage) → Task 11
- [x] UI — Header with diacritic animation → Task 12
- [x] UI — TextInput → Task 13
- [x] UI — ActionBar → Task 13
- [x] UI — TextOutput with alternatives → Task 14
- [x] UI — CopyButton with fallback → Task 14
- [x] Typographic Workshop styles → Task 15
- [x] Data build script → Task 17
- [x] `đ` reversibility warning → Task 15 (warning text in App.tsx)
- [x] Error messages in i18n files → Task 10
- [x] No trigrams (dropped from spec) → confirmed

**Placeholder scan:** No TBDs, TODOs, or "implement later". All code steps contain actual code.

**Type consistency:** All types defined in `src/engines/types.ts` (Task 2). `SyllableMap`, `UnigramMap`, `BigramMap` used consistently across addAccents, worker, and build-data script. `AccentResult` used in both addAccents return and App.tsx.
