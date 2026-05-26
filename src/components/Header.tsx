import { useState, useEffect } from 'react';
import { useTranslation } from '../i18n/useTranslation';
import { useTheme } from '../theme/ThemeProvider';

const DIACRITICS = ['ắ', 'ồ', 'ệ', 'ưỡ', 'ỉ', 'ẳ', 'ử', 'ễ'];

export function Header() {
  const { locale, t, setLocale } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [diacriticIndex, setDiacriticIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setDiacriticIndex((i) => (i + 1) % DIACRITICS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="header">
      <div className="header-brand">
        <span className="header-diacritic" key={diacriticIndex}>
          {DIACRITICS[diacriticIndex]}
        </span>
        <div>
          <h1 className="header-title">{t('appTitle')}</h1>
          <p className="header-subtitle">{t('appSubtitle')}</p>
        </div>
      </div>
      <div className="header-controls">
        <button
          className="toggle-btn"
          onClick={() => setLocale(locale === 'en' ? 'vi' : 'en')}
          aria-label="Toggle language"
        >
          {t('language')}
        </button>
        <button className="toggle-btn" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? '☀' : '☾'}
        </button>
      </div>
    </header>
  );
}
