import { describe, it, expect } from 'vitest';
import { expandAbbreviations, createTrie, levenshtein } from '../../src/engines/expandAbbrev';
import abbreviations from '../../src/data/abbreviations.json';

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for single insertion', () => {
    expect(levenshtein('abc', 'ab')).toBe(1);
  });

  it('returns correct distance for single substitution', () => {
    expect(levenshtein('abc', 'axc')).toBe(1);
  });
});

describe('createTrie and exact match', () => {
  it('finds exact match in trie', () => {
    const trie = createTrie(abbreviations);
    expect(trie.exactLookup('k')).toBe('không');
  });

  it('finds multi-word abbreviation expansion', () => {
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
    const result = expandAbbreviations('k j', abbreviations);
    expect(result).toContain('không');
    expect(result).toContain('gì');
  });

  it('preserves non-abbreviation words', () => {
    const result = expandAbbreviations('hello k', abbreviations);
    expect(result).toBe('hello không');
  });

  it('skips expansion if no match within threshold', () => {
    const result = expandAbbreviations('abcdefg', abbreviations);
    expect(result).toBe('abcdefg');
  });

  it('preserves punctuation', () => {
    const result = expandAbbreviations('k, j!', abbreviations);
    expect(result).toContain('không');
    expect(result).toContain('gì');
  });

  it('handles empty string', () => {
    expect(expandAbbreviations('', abbreviations)).toBe('');
  });
});
