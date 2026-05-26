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
