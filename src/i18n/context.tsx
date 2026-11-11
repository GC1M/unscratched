import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo';

import { deviceLocale, langOf, translator, type Lang, type T } from './index';

export type LangPref = 'system' | Lang;
const SETTING_KEY = 'language';

interface Value {
  t: T;
  lang: Lang;
  /** For toLocaleDateString: the device locale (keeps regional date order) unless the user picked another language. */
  locale: string | undefined;
  pref: LangPref;
  setPref: (pref: LangPref) => void;
}

// Outside the provider (screen tests): English with the device date format, as before translations.
const LanguageContext = createContext<Value>({ t: translator('en'), lang: 'en', locale: undefined, pref: 'system', setPref: () => {} });

/** Loads the saved language preference ("system" follows the device) and provides t() to the app. */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<LangPref>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getDb()
        .then((db) => getSetting(db, SETTING_KEY))
        .catch(() => null);
      if (saved === 'en' || saved === 'es') setPrefState(saved);
      setReady(true);
    })();
  }, []);

  const setPref = useCallback((next: LangPref) => {
    setPrefState(next);
    getDb()
      .then((db) => setSetting(db, SETTING_KEY, next))
      .catch(() => {});
  }, []);

  const value = useMemo(() => {
    const device = deviceLocale();
    const lang = pref === 'system' ? langOf(device) : pref;
    const locale = pref === 'system' || device.toLowerCase().split('-')[0] === lang ? device : lang;
    return { t: translator(lang), lang, locale, pref, setPref };
  }, [pref, setPref]);
  return <LanguageContext.Provider value={value}>{ready ? children : null}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}
