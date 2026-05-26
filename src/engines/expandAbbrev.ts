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
      node = node.children.get(ch) as TrieNode;
    }
    node.value = val;
  }

  return {
    exactLookup(word: string): string | null {
      let node: TrieNode | undefined = root;
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
      const exact = trie.exactLookup(token);
      if (exact !== null) return exact;

      if (/^[a-zA-ZÀ-ỹđĐ]+$/.test(token) && token.length <= 5) {
        const fuzzy = fuzzyLookup(token, abbreviations);
        if (fuzzy) return fuzzy;
      }

      return token;
    })
    .join('');
}
