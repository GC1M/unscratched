import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance, useColorScheme } from 'react-native';

import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo';

// Plaster and ink. Condition colors (good, fair, damaged) are the only saturation in the app.
export const palettes = {
  light: {
    ink: '#15241F',
    ink60: '#5E6A66',
    ink30: '#B5BCB8',
    hair: 'rgba(21,36,31,0.10)',
    plaster: '#F3F4F1',
    paper: '#FFFFFF',
    onInk: '#FFFFFF',
    good: '#2F6B4F',
    goodBg: '#E3EFE8',
    fair: '#B7791F',
    fairInk: '#8A5A12',
    fairBg: '#F7EBD3',
    damaged: '#A63A2B',
    damagedBg: '#F5E0DB',
  },
  dark: {
    ink: '#ECEFEA',
    ink60: '#9AA49F',
    ink30: '#525C57',
    hair: 'rgba(236,239,234,0.08)',
    plaster: '#0F1513',
    paper: '#1A211E',
    onInk: '#0F1513',
    good: '#8CC9A8',
    goodBg: '#1D3429',
    fair: '#E3B661',
    fairInk: '#E3B661',
    fairBg: '#3A2E14',
    damaged: '#E68F7A',
    damagedBg: '#3E1F19',
  },
};
export type Colors = typeof palettes.light;

export const serif = 'Newsreader_400Regular';
export const serifItalic = 'Newsreader_400Regular_Italic';
export const radius = { capsule: 26, panel: 22, tile: 12 };

export type ThemePref = 'system' | 'light' | 'dark';
const SETTING_KEY = 'appearance';

const PrefContext = createContext<{ pref: ThemePref; setPref: (pref: ThemePref) => void }>({
  pref: 'system',
  setPref: () => {},
});

function apply(pref: ThemePref) {
  Appearance.setColorScheme(pref === 'system' ? 'auto' : pref);
}

/** Loads the saved appearance preference and forces the app-wide color scheme to match. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>('system');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getSetting(await getDb(), SETTING_KEY).catch(() => null);
      if (saved === 'light' || saved === 'dark') {
        setPrefState(saved);
        apply(saved);
      }
      setReady(true);
    })();
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    apply(next);
    getDb().then((db) => setSetting(db, SETTING_KEY, next));
  }, []);

  const value = useMemo(() => ({ pref, setPref }), [pref, setPref]);
  return <PrefContext.Provider value={value}>{ready ? children : null}</PrefContext.Provider>;
}

export function useThemePref() {
  return useContext(PrefContext);
}

/** Colors for the active scheme. The scheme already reflects the saved preference via Appearance. */
export function useTheme() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { scheme, c: palettes[scheme] };
}
