import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import en from './en.json';
import vi from './vi.json';

type Locale = 'en' | 'vi';
type Translations = Record<string, string>;

const locales: Record<Locale, Translations> = { en, vi };

interface I18nContextType {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  t: (key) => key,
  setLocale: () => {},
});

function getInitialLocale(): Locale {
  try {
    const saved = localStorage.getItem('viet-tool-locale') as Locale;
    if (saved && locales[saved]) return saved;
  } catch {}
  return 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try { localStorage.setItem('viet-tool-locale', newLocale); } catch {}
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = locales[locale][key] ?? locales.en[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
