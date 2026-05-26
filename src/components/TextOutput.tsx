import { useState } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { CopyButton } from './CopyButton';

interface TextOutputProps {
  result: string | null;
  alternatives: string[];
  scores: number[];
  lowConfidence: boolean;
}

export function TextOutput({ result, alternatives, scores, lowConfidence }: TextOutputProps) {
  const { t } = useTranslation();
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const allResults = result ? [result, ...alternatives] : [];
  const selectedText = allResults[selectedIndex] ?? '';

  if (!result) {
    return (
      <div className="text-output">
        <textarea
          className="output-area"
          value=""
          readOnly
          placeholder={t('outputPlaceholder')}
          rows={8}
        />
      </div>
    );
  }

  return (
    <div className="text-output">
      <div className="output-area-wrapper">
        <textarea className="output-area" value={selectedText} readOnly rows={8} />
        {lowConfidence && <div className="low-confidence-badge">{t('lowConfidence')}</div>}
      </div>
      <div className="output-actions">
        <CopyButton text={selectedText} />
        {allResults.length > 1 && (
          <button
            className="toggle-btn alternatives-toggle"
            onClick={() => setShowAlternatives(!showAlternatives)}
          >
            {showAlternatives ? t('hideAlternatives') : t('showAlternatives', { count: allResults.length - 1 })}
          </button>
        )}
      </div>
      {showAlternatives && (
        <ul className="alternatives-list">
          {allResults.map((r, i) => (
            <li
              key={i}
              className={`alternative-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => setSelectedIndex(i)}
            >
              <span className="alternative-rank">#{i + 1}</span>
              <span className="alternative-text">{r}</span>
              {scores[i] !== undefined && <span className="alternative-score">{scores[i].toFixed(2)}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
