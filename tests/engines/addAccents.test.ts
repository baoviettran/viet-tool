import { describe, it, expect } from 'vitest';
import {
  tokenizeSyllables,
  isVietnameseSyllable,
  lookupCandidates,
  viterbi,
  kBestViterbi,
  addAccents,
} from '../../src/engines/addAccents';
import syllablesData from '../../src/data/syllables.json';
import unigramsData from '../../src/data/unigrams.json';
import bigramsData from '../../src/data/bigrams.json';
import type { SyllableMap, UnigramMap, BigramMap } from '../../src/engines/types';

const syllables = syllablesData as SyllableMap;
const unigrams = unigramsData as UnigramMap;
const bigrams = bigramsData as BigramMap;

describe('tokenizeSyllables', () => {
  it('splits a simple sentence into syllables', () => {
    expect(tokenizeSyllables('toi di choi')).toEqual([
      { text: 'toi', isVietnamese: true },
      { text: 'di', isVietnamese: true },
      { text: 'choi', isVietnamese: true },
    ]);
  });

  it('preserves punctuation as non-Vietnamese tokens', () => {
    const tokens = tokenizeSyllables('toi, di!');
    expect(tokens).toContainEqual({ text: ',', isVietnamese: false });
    expect(tokens).toContainEqual({ text: '!', isVietnamese: false });
  });

  it('handles empty string', () => {
    expect(tokenizeSyllables('')).toEqual([]);
  });
});

describe('isVietnameseSyllable', () => {
  it('returns true for unaccented Vietnamese syllable', () => {
    expect(isVietnameseSyllable('toi')).toBe(true);
  });

  it('returns false for numbers', () => {
    expect(isVietnameseSyllable('123')).toBe(false);
  });

  it('returns false for punctuation', () => {
    expect(isVietnameseSyllable(',')).toBe(false);
  });
});

describe('lookupCandidates', () => {
  it('returns all accented forms for a known syllable', () => {
    const result = lookupCandidates('toi', syllables);
    expect(result).toContain('tôi');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('returns single-element array for unknown syllable (passthrough)', () => {
    expect(lookupCandidates('xyz', syllables)).toEqual(['xyz']);
  });

  it('detects already-accented syllable and returns it as-is', () => {
    expect(lookupCandidates('tôi', syllables)).toEqual(['tôi']);
  });
});

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
    const candidates = [lookupCandidates('cam', syllables)];
    const result = viterbi(candidates, bigrams, unigrams);
    expect(result.path).toHaveLength(1);
    expect(result.path[0]).toBe('cảm');
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

  it('produces meaningfully different paths', () => {
    const candidates = [
      lookupCandidates('toi', syllables),
      lookupCandidates('la', syllables),
      lookupCandidates('ban', syllables),
    ];
    const results = kBestViterbi(candidates, bigrams, unigrams, 3);
    const paths = results.map((r) => r.path.join(' '));
    expect(new Set(paths).size).toBeGreaterThan(1);
  });
});

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

  it('preserves uppercase first letter from input', async () => {
    const result = await addAccents('Toi la ban', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('Tôi là bạn');
  });

  it('handles all-lowercase input unchanged', async () => {
    const result = await addAccents('toi la ban', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('tôi là bạn');
  });
});

describe('sentence splitting', () => {
  it('processes each sentence independently', async () => {
    const result = await addAccents('toi la ban. di choi', syllables, unigrams, bigrams);
    const best = result.results[0];
    expect(best).toContain('tôi là bạn');
    expect(best).toContain('đi chơi');
  });

  it('preserves inter-sentence whitespace', async () => {
    const result = await addAccents('toi la ban.  di choi', syllables, unigrams, bigrams);
    expect(result.results[0]).toContain('.  ');
  });

  it('preserves punctuation in output', async () => {
    const result = await addAccents('toi la ban. di choi!', syllables, unigrams, bigrams);
    expect(result.results[0]).toContain('.');
    expect(result.results[0]).toContain('!');
  });

  it('returns k-best across all sentences', async () => {
    const result = await addAccents('toi la ban. di choi', syllables, unigrams, bigrams);
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    for (const r of result.results) {
      expect(r).toContain('.');
    }
  });

  it('handles text without sentence boundaries as single chunk', async () => {
    const result = await addAccents('toi la ban di choi', syllables, unigrams, bigrams);
    expect(result.results[0]).toBe('tôi là bạn đi chơi');
  });
});
