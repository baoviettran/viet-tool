import { useState, useCallback, useRef, useEffect } from 'react';
import { Header } from './components/Header';
import { TextInput } from './components/TextInput';
import { TextOutput } from './components/TextOutput';
import { ActionBar } from './components/ActionBar';
import { removeAccents } from './engines/removeAccents';
import { addAccents } from './engines/addAccents';
import { expandAbbreviations } from './engines/expandAbbrev';
import type { AccentResult, SyllableMap, UnigramMap, BigramMap, WorkerResponse } from './engines/types';
import syllablesData from './data/syllables.json';
import unigramsData from './data/unigrams.json';
import bigramsData from './data/bigrams.json';
import abbreviationsData from './data/abbreviations.json';
import { useTranslation } from './i18n/useTranslation';

const syllables = syllablesData as SyllableMap;
const unigrams = unigramsData as UnigramMap;
const bigrams = bigramsData as BigramMap;

const WORKER_IDLE_MS = 5 * 60 * 1000;

function generateId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

function App() {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [output, setOutput] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [scores, setScores] = useState<number[]>([]);
  const [lowConfidence, setLowConfidence] = useState(false);
  const [warning, setWarning] = useState('');

  const workerRef = useRef<Worker | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  function getWorker(): Worker {
    if (workerRef.current) return workerRef.current;
    const w = new Worker(
      new URL('./engines/worker.ts', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = w;
    return w;
  }

  function resetIdleTimer() {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      workerRef.current?.terminate();
      workerRef.current = null;
    }, WORKER_IDLE_MS);
  }

  const handleRemoveAccents = useCallback(() => {
    setOutput(removeAccents(input));
    setAlternatives([]);
    setScores([]);
    setLowConfidence(false);
    setWarning(t('notReversible'));
  }, [input, t]);

  const handleAddAccents = useCallback(async () => {
    try {
      const syllableCount = input.trim().split(/\s+/).length;

      if (syllableCount > 10 && typeof Worker !== 'undefined') {
        const worker = getWorker();
        const id = generateId();
        resetIdleTimer();

        worker.onmessage = (e) => {
          const msg = e.data as WorkerResponse;
          if (msg.type === 'RESULT' && msg.id === id) {
            setOutput(msg.payload.results[0] ?? null);
            setAlternatives(msg.payload.results.slice(1));
            setScores(msg.payload.scores);
            setLowConfidence(msg.payload.lowConfidence);
            setWarning('');
            resetIdleTimer();
          }
          if (msg.type === 'ERROR' && msg.id === id) {
            setOutput(null);
            setWarning(t('errorProcessing'));
            resetIdleTimer();
          }
        };

        worker.postMessage({
          type: 'ADD_ACCENTS',
          id,
          payload: { text: input, k: 3 },
        });
      } else {
        const result: AccentResult = await addAccents(input, syllables, unigrams, bigrams);
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
            <TextOutput result={output} alternatives={alternatives} scores={scores} lowConfidence={lowConfidence} />
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
