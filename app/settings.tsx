import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text } from 'react-native';

import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo';
import type { Key } from '@/i18n';
import { useT, type LangPref } from '@/i18n/context';
import { SUGGEST_SETTING } from '@/lib/suggestNote';
import { useTheme, useThemePref, type ThemePref } from '@/theme';

const APPEARANCE: { value: ThemePref; label: Key; meta?: Key }[] = [
  { value: 'system', label: 'settings.matchIphone', meta: 'settings.followsSystem' },
  { value: 'light', label: 'settings.light' },
  { value: 'dark', label: 'settings.dark' },
];

// Language names stay in their own language so a user can always find theirs.
const LANGUAGES: { value: LangPref; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
];

export default function Settings() {
  const { c } = useTheme();
  const { pref, setPref } = useThemePref();
  const { t, pref: langPref, setPref: setLangPref } = useT();
  const [suggest, setSuggest] = useState(false);

  useEffect(() => {
    getDb()
      .then((db) => getSetting(db, SUGGEST_SETTING))
      .then((v) => setSuggest(v === '1'))
      .catch(() => {});
  }, []);

  function toggleSuggest(on: boolean) {
    setSuggest(on);
    getDb()
      .then((db) => setSetting(db, SUGGEST_SETTING, on ? '1' : '0'))
      .catch(() => setSuggest(!on));
  }

  return (
    <>
      <Stack.Screen options={{ title: t('settings.title'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      <Screen>
        <SectionLabel>{t('settings.appearance')}</SectionLabel>
        <Group>
          {APPEARANCE.map((o, idx) => (
            <Row
              key={o.value}
              first={idx === 0}
              onPress={() => setPref(o.value)}
              a11y={t(o.label)}
              selected={pref === o.value}
              trailing={<Text style={[styles.check, { color: c.ink, opacity: pref === o.value ? 1 : 0 }]}>✓</Text>}
            >
              <RowTitle>{t(o.label)}</RowTitle>
              {o.meta && <RowMeta>{t(o.meta)}</RowMeta>}
            </Row>
          ))}
        </Group>
        <SectionLabel>{t('settings.language')}</SectionLabel>
        <Group>
          {[{ value: 'system' as const, label: t('settings.matchIphone') }, ...LANGUAGES].map((o, idx) => (
            <Row
              key={o.value}
              first={idx === 0}
              onPress={() => setLangPref(o.value)}
              a11y={o.label}
              selected={langPref === o.value}
              trailing={<Text style={[styles.check, { color: c.ink, opacity: langPref === o.value ? 1 : 0 }]}>✓</Text>}
            >
              <RowTitle>{o.label}</RowTitle>
              {o.value === 'system' && <RowMeta>{t('settings.followsLanguage')}</RowMeta>}
            </Row>
          ))}
        </Group>
        <SectionLabel>{t('settings.yourData')}</SectionLabel>
        <Group>
          <Row first>
            <RowTitle>{t('settings.onPhone')}</RowTitle>
            <RowMeta>{t('settings.onPhoneMeta')}</RowMeta>
          </Row>
          <Row
            trailing={<Switch accessibilityLabel={t('settings.suggest')} value={suggest} onValueChange={toggleSuggest} />}
          >
            <RowTitle>{t('settings.suggest')}</RowTitle>
            <RowMeta>{t('settings.suggestMeta')}</RowMeta>
          </Row>
        </Group>
        <SectionLabel>{t('settings.about')}</SectionLabel>
        <Group>
          <Row first trailing={<Text style={[styles.version, { color: c.ink60 }]}>{Constants.expoConfig?.version ?? ''}</Text>}>
            <RowTitle>{t('settings.version')}</RowTitle>
          </Row>
          <Row>
            <RowTitle>{t('common.notLegalAdvice')}</RowTitle>
            <RowMeta>{t('settings.notOpinion')}</RowMeta>
          </Row>
        </Group>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  check: { fontSize: 18, fontWeight: '600' },
  version: { fontSize: 15 },
});
