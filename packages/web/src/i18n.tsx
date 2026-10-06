import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { en } from './locales/en';
import { it } from './locales/it';

export type Locale = 'it' | 'en';
type Params = Readonly<Record<string, string | number>>;

const DICTIONARIES: Record<Locale, Record<string, string>> = { it, en };

/** Parametri che sono a loro volta identificativi da tradurre (settore, competenza, ...). */
const TRANSLATED_PARAMS: Record<string, string> = {
  event: 'event',
  sector: 'sector',
  skill: 'skill',
  classId: 'class',
  role: 'role',
  level: 'career',
};

function detectLocale(): Locale {
  try {
    const saved = localStorage.getItem('locale');
    if (saved === 'it' || saved === 'en') return saved;
  } catch {
    // localStorage non disponibile (es. navigazione privata): si usa la lingua del browser.
  }
  return navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en';
}

export function translate(locale: Locale, key: string, params: Params = {}): string {
  const dictionary = DICTIONARIES[locale];
  const template = dictionary[key] ?? it[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = params[name];
    if (value === undefined) return '';
    const prefix = TRANSLATED_PARAMS[name];
    if (prefix !== undefined && typeof value === 'string') {
      const translated = dictionary[`${prefix}.${value}`];
      if (translated !== undefined) return translated;
    }
    if (name === 'company' && typeof value === 'string') return `#${value}`;
    return typeof value === 'number' ? formatNumber(locale, value) : value;
  });
}

export function formatNumber(locale: Locale, value: number, digits = 2): string {
  return new Intl.NumberFormat(locale === 'it' ? 'it-IT' : 'en-US', {
    maximumFractionDigits: digits,
  }).format(value);
}

interface I18n {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: (key: string, params?: Params) => string;
  readonly n: (value: number, digits?: number) => string;
  readonly pct: (value: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem('locale', next);
    } catch {
      // Preferenza non salvata: nessun problema.
    }
  }, []);
  const value = useMemo<I18n>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
      n: (value, digits) => formatNumber(locale, value, digits),
      pct: (value) => `${formatNumber(locale, value * 100, 1)}%`,
    }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (context === null) throw new Error('I18nProvider mancante');
  return context;
}

/** Messaggio leggibile per un errore delle API: codice tradotto più dettaglio, se presente. */
export function describeError(
  t: (key: string) => string,
  code: string,
  detail: string | null,
): string {
  const base = t(`error.${code}`);
  if (detail === null) return base;
  const known = t(`error.${detail}`);
  return `${base} ${known === `error.${detail}` ? detail : known}`;
}
