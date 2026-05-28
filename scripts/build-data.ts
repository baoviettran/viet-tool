import { writeFileSync, mkdirSync, createReadStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

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
  if (word.length < 1 || word.length > 7) return false;
  // Must be NFC-normalized (no combining marks after base characters)
  if (word.normalize('NFC') !== word) return false;
  return /^[a-zA-ZÀ-ỹđĐ]+$/.test(word);
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

async function main() {
  const dumpPaths = process.argv.slice(2);
  if (dumpPaths.length === 0) {
    console.error('Usage: npx tsx scripts/build-data.ts <dump1.xml> [dump2.xml ...]');
    process.exit(1);
  }

  const counts: Counts = {
    unigramCounts: new Map(),
    bigramCounts: new Map(),
    syllableGroups: new Map(),
    totalSyllables: 0,
  };

  let articleCount = 0;

  for (const dumpPath of dumpPaths) {
    console.log(`Processing ${dumpPath}...`);
    let inText = false;
    let textBuffer = '';

    const rl = createInterface({
      input: createReadStream(dumpPath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!inText) {
        const openMatch = line.match(/<text[^>]*>/);
        if (openMatch) {
          inText = true;
          const after = line.slice(line.indexOf('>') + 1);
          if (after.includes('</text>')) {
            const content = after.slice(0, after.indexOf('</text>'));
            const articleText = content
              .replace(/[\[\]{|}=<>]/g, ' ')
              .replace(/https?:\/\/\S+/g, '')
              .replace(/[^a-zA-ZÀ-ỹđĐ\s]/g, ' ');
            processText(articleText, counts);
            articleCount++;
            inText = false;
            textBuffer = '';
          } else {
            textBuffer = after + '\n';
          }
        }
      } else {
        if (line.includes('</text>')) {
          textBuffer += line.slice(0, line.indexOf('</text>'));
          const articleText = textBuffer
            .replace(/[\[\]{|}=<>]/g, ' ')
            .replace(/https?:\/\/\S+/g, '')
            .replace(/[^a-zA-ZÀ-ỹđĐ\s]/g, ' ');
          processText(articleText, counts);
          articleCount++;
          inText = false;
          textBuffer = '';
        } else {
          textBuffer += line + '\n';
        }
      }

      if (articleCount % 10000 === 0 && articleCount > 0) {
        console.log(`Processed ${articleCount} articles...`);
      }
    }
  }

  console.log(`Processed ${articleCount} articles, ${counts.totalSyllables} syllables`);

  // Prune: keep only unigrams seen >= MIN_COUNT times
  const MIN_UNIGRAM = 50;
  const keptUnigrams = new Map<string, number>();
  for (const [syl, count] of counts.unigramCounts) {
    if (count >= MIN_UNIGRAM) keptUnigrams.set(syl, count);
  }
  console.log(`Pruned unigrams: ${counts.unigramCounts.size} → ${keptUnigrams.size} (min count ${MIN_UNIGRAM})`);

  const keptSet = new Set(keptUnigrams.keys());

  const syllables: Record<string, string[]> = {};
  for (const [stripped, accented] of counts.syllableGroups) {
    const valid = [...accented].filter((a) => keptSet.has(a));
    if (valid.length > 0) syllables[stripped] = valid.sort();
  }

  const vocabSize = keptUnigrams.size;
  const totalKept = [...keptUnigrams.values()].reduce((a, b) => a + b, 0);
  const unigrams: Record<string, number> = {};
  for (const [syllable, count] of keptUnigrams) {
    unigrams[syllable] = Math.log((count + 1) / (totalKept + vocabSize));
  }

  const BIGRAM_MIN = 2;
  const MAX_BIGRAMS_PER_WORD = 30;
  const bigrams: Record<string, Record<string, number>> = {};
  for (const [prev, inner] of counts.bigramCounts) {
    if (!keptSet.has(prev)) continue;
    const prevTotal = keptUnigrams.get(prev) ?? 0;
    const entries: Array<[string, number]> = [];
    for (const [curr, count] of inner) {
      if (count >= BIGRAM_MIN && keptSet.has(curr)) {
        entries.push([curr, Math.log((count + 1) / (prevTotal + vocabSize))]);
      }
    }
    // Keep only top-N by score
    entries.sort((a, b) => b[1] - a[1]);
    const top = entries.slice(0, MAX_BIGRAMS_PER_WORD);
    if (top.length > 0) {
      bigrams[prev] = Object.fromEntries(top);
    }
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });

  writeFileSync(join(OUTPUT_DIR, 'syllables.json'), JSON.stringify(syllables, null, 2));
  writeFileSync(join(OUTPUT_DIR, 'unigrams.json'), JSON.stringify(unigrams));
  writeFileSync(join(OUTPUT_DIR, 'bigrams.json'), JSON.stringify(bigrams));

  console.log(`Written to ${OUTPUT_DIR}/`);
  console.log(`Syllables: ${Object.keys(syllables).length}`);
  console.log(`Unigrams: ${Object.keys(unigrams).length}`);
  console.log(`Bigrams: ${Object.keys(bigrams).length} prev-syllables`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
