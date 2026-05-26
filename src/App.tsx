import { useState, useCallback } from 'react';
import { Header } from './components/Header';
import { TextInput } from './components/TextInput';
import { TextOutput } from './components/TextOutput';
import { ActionBar } from './components/ActionBar';
import { removeAccents } from './engines/removeAccents';
import { addAccents } from './engines/addAccents';
import { expandAbbreviations } from './engines/expandAbbrev';
import type { AccentResult, SyllableMap, UnigramMap, BigramMap } from './engines/types';
import syllablesData from './data/syllables.json';
import unigramsData from './data/unigrams.json';
import bigramsData from './data/bigrams.json';
import abbreviationsData from './data/abbreviations.json';
import { useTranslation } from './i18n/useTranslation';

const syllables = syllablesData as SyllableMap;
const unigrams = unigramsData as UnigramMap;
const bigrams = bigramsData as BigramMap;

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
      const result: AccentResult = await addAccents(input, syllables, unigrams, bigrams);
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
