import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo';

const SETTING_KEY = 'onboarded';

const OnboardingContext = createContext<{ onboarded: boolean; finish: () => void }>({
  onboarded: true,
  finish: () => {},
});

/** Loads the onboarding flag so the root stack can show onboarding on first launch only. */
export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const saved = await getSetting(await getDb(), SETTING_KEY).catch(() => null);
      setOnboarded(saved === '1');
    })();
  }, []);

  const finish = useCallback(() => {
    setOnboarded(true);
    getDb()
      .then((db) => setSetting(db, SETTING_KEY, '1'))
      .catch(() => {});
  }, []);

  const value = useMemo(() => ({ onboarded: !!onboarded, finish }), [onboarded, finish]);
  return <OnboardingContext.Provider value={value}>{onboarded === null ? null : children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
