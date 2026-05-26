import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, '..', 'src', 'data');

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

    if (!counts.syllableGroups.has(stripped)) {
      counts.syllableGroups.set(stripped, new Set());
    }
    counts.syllableGroups.get(stripped)!.add(lower);

    counts.unigramCounts.set(lower, (counts.unigramCounts.get(lower) ?? 0) + 1);
    counts.totalSyllables++;
  }

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

  const syllables: Record<string, string[]> = {};
  for (const [stripped, accented] of counts.syllableGroups) {
    syllables[stripped] = [...accented].sort();
  }

  const vocabSize = counts.unigramCounts.size;
  const unigrams: Record<string, number> = {};
  for (const [syllable, count] of counts.unigramCounts) {
    unigrams[syllable] = Math.log((count + 1) / (counts.totalSyllables + vocabSize));
  }

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
