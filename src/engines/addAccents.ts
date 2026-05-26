import type { SyllableMap, UnigramMap, BigramMap, AccentResult } from './types';

const UNSEEN_PENALTY = -20;

function getTransitionScore(
  prev: string, curr: string,
  bigrams: BigramMap, unigrams: UnigramMap
): number {
  const bigramScore = bigrams[prev]?.[curr];
  if (bigramScore !== undefined) return bigramScore;
  return unigrams[curr] ?? UNSEEN_PENALTY;
}

export function tokenizeSyllables(text: string): Array<{ text: string; isVietnamese: boolean }> {
  if (!text.trim()) return [];
  const tokens: Array<{ text: string; isVietnamese: boolean }> = [];
  const parts = text.split(/\s+/);
  for (const part of parts) {
    if (!part) continue;
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

function hasVietnameseDiacritics(text: string): boolean {
  return /[À-ỹđĐ]/.test(text);
}

export function lookupCandidates(syllable: string, syllableMap: SyllableMap): string[] {
  if (hasVietnameseDiacritics(syllable)) return [syllable];
  const lower = syllable.toLowerCase();
  const candidates = syllableMap[lower];
  if (!candidates) return [syllable];
  if (syllable[0] === syllable[0].toUpperCase()) {
    return candidates.map((c) => c[0].toUpperCase() + c.slice(1));
  }
  return candidates;
}

export function viterbi(
  candidates: string[][],
  bigrams: BigramMap,
  unigrams: UnigramMap
): { path: string[]; score: number } {
  const T = candidates.length;
  if (T === 0) return { path: [], score: 0 };

  const dp: number[][] = [];
  const bp: number[][] = [];

  dp[0] = candidates[0].map((c) => unigrams[c] ?? UNSEEN_PENALTY);
  bp[0] = candidates[0].map(() => -1);

  for (let i = 1; i < T; i++) {
    dp[i] = [];
    bp[i] = [];
    for (let j = 0; j < candidates[i].length; j++) {
      let bestScore = -Infinity;
      let bestPrev = 0;
      const curr = candidates[i][j];
      for (let k = 0; k < candidates[i - 1].length; k++) {
        const prev = candidates[i - 1][k];
        const score = dp[i - 1][k] + getTransitionScore(prev, curr, bigrams, unigrams);
        if (score > bestScore) { bestScore = score; bestPrev = k; }
      }
      dp[i][j] = bestScore;
      bp[i][j] = bestPrev;
    }
  }

  let bestFinalIdx = 0;
  let bestFinalScore = -Infinity;
  for (let j = 0; j < dp[T - 1].length; j++) {
    if (dp[T - 1][j] > bestFinalScore) { bestFinalScore = dp[T - 1][j]; bestFinalIdx = j; }
  }

  const path: string[] = new Array(T);
  let idx = bestFinalIdx;
  for (let i = T - 1; i >= 0; i--) { path[i] = candidates[i][idx]; idx = bp[i][idx]; }
  return { path, score: bestFinalScore };
}

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

  const dp: PathCandidate[][][] = [];
  dp[0] = candidates[0].map((c) => [
    { score: unigrams[c] ?? UNSEEN_PENALTY, prevCandidateIdx: -1, prevPathRank: -1 },
  ]);

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
      incoming.sort((a, b) => b.score - a.score);
      dp[i][j] = incoming.slice(0, k);
    }
  }

  const finalCandidates: Array<{ score: number; candidateIdx: number; pathRank: number }> = [];
  for (let j = 0; j < dp[T - 1].length; j++) {
    for (let rank = 0; rank < dp[T - 1][j].length; rank++) {
      finalCandidates.push({ score: dp[T - 1][j][rank].score, candidateIdx: j, pathRank: rank });
    }
  }
  finalCandidates.sort((a, b) => b.score - a.score);
  const topFinal = finalCandidates.slice(0, k);

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

export async function addAccents(
  text: string,
  syllableMap: SyllableMap,
  unigrams: UnigramMap,
  bigrams: BigramMap,
  k: number = 3
): Promise<AccentResult> {
  if (!text.trim()) return { results: [], scores: [], lowConfidence: false };

  // Split by whitespace to preserve original spacing
  const whitespaceParts = text.split(/(\s+)/);

  // For each non-whitespace part, split into sub-tokens (alpha vs non-alpha)
  // and build a flat list with position info so we can reconstruct
  interface TokenInfo {
    text: string;
    isVietnamese: boolean;
    partIndex: number;       // index into whitespaceParts
    subIndex: number;        // index within the sub-token match array
  }

  const allTokens: TokenInfo[] = [];
  for (let pi = 0; pi < whitespaceParts.length; pi++) {
    const part = whitespaceParts[pi];
    if (/^\s+$/.test(part)) continue;
    if (!part) continue;
    const subTokens = part.match(/[a-zA-ZÀ-ỹđĐ]+|[^a-zA-ZÀ-ỹđĐ]+/g) ?? [part];
    for (let si = 0; si < subTokens.length; si++) {
      const token = subTokens[si];
      allTokens.push({
        text: token,
        isVietnamese: isVietnameseSyllable(token),
        partIndex: pi,
        subIndex: si,
      });
    }
  }

  const vietnameseTokens = allTokens.filter((t) => t.isVietnamese);

  if (vietnameseTokens.length === 0) {
    return { results: [text], scores: [0], lowConfidence: false };
  }

  if (vietnameseTokens.length === 1) {
    const candidates = lookupCandidates(vietnameseTokens[0].text, syllableMap);
    // For single token, replace just that token in the original text
    const results = candidates.map((c) => {
      const parts = [...whitespaceParts];
      // Find which whitespace part and rebuild it
      const vt = vietnameseTokens[0];
      const originalPart = parts[vt.partIndex];
      const subs = originalPart.match(/[a-zA-ZÀ-ỹđĐ]+|[^a-zA-ZÀ-ỹđĐ]+/g) ?? [originalPart];
      subs[vt.subIndex] = c;
      parts[vt.partIndex] = subs.join('');
      return parts.join('');
    });
    return { results, scores: candidates.map(() => 0), lowConfidence: true };
  }

  const candidateArrays: string[][] = [];
  const vietnameseTokenList: TokenInfo[] = [];
  for (let i = 0; i < allTokens.length; i++) {
    if (allTokens[i].isVietnamese) {
      candidateArrays.push(lookupCandidates(allTokens[i].text, syllableMap));
      vietnameseTokenList.push(allTokens[i]);
    }
  }

  const lowConfidence = vietnameseTokens.length <= 3;
  const kResults = kBestViterbi(candidateArrays, bigrams, unigrams, k);

  const results: string[] = kResults.map((r) => {
    const parts = [...whitespaceParts];
    // Group replacements by partIndex to rebuild each part correctly
    for (let vi = 0; vi < vietnameseTokenList.length; vi++) {
      const vt = vietnameseTokenList[vi];
      const originalPart = parts[vt.partIndex];
      const subs = originalPart.match(/[a-zA-ZÀ-ỹđĐ]+|[^a-zA-ZÀ-ỹđĐ]+/g) ?? [originalPart];
      subs[vt.subIndex] = r.path[vi];
      parts[vt.partIndex] = subs.join('');
    }
    return parts.join('');
  });

  return { results, scores: kResults.map((r) => r.score), lowConfidence };
}
