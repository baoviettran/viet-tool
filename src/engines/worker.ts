import { addAccents } from './addAccents';
import type { WorkerRequest, WorkerResponse, SyllableMap, UnigramMap, BigramMap } from './types';

let syllablesData: SyllableMap | null = null;
let unigramsData: UnigramMap | null = null;
let bigramsData: BigramMap | null = null;
let dataLoaded = false;

async function loadData() {
  if (dataLoaded) return;
  const syllablesModule = await import('../data/syllables.json');
  const unigramsModule = await import('../data/unigrams.json');
  const bigramsModule = await import('../data/bigrams.json');
  syllablesData = syllablesModule.default as SyllableMap;
  unigramsData = unigramsModule.default as UnigramMap;
  bigramsData = bigramsModule.default as BigramMap;
  dataLoaded = true;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'ADD_ACCENTS') {
    try {
      await loadData();
      const result = await addAccents(
        msg.payload.text,
        syllablesData!,
        unigramsData!,
        bigramsData!,
        msg.payload.k
      );
      const response: WorkerResponse = {
        type: 'RESULT',
        id: msg.id,
        payload: { results: result.results, scores: result.scores, lowConfidence: result.lowConfidence },
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
