import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text } from 'react-native';

import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo';
import { SUGGEST_SETTING } from '@/lib/suggestNote';
import { useTheme, useThemePref, type ThemePref } from '@/theme';

const APPEARANCE: { value: ThemePref; label: string; meta?: string }[] = [
  { value: 'system', label: 'Match iPhone', meta: 'Follows the system setting' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings() {
  const { c } = useTheme();
  const { pref, setPref } = useThemePref();
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
      <Stack.Screen options={{ title: 'Settings', headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      <Screen>
        <SectionLabel>Appearance</SectionLabel>
        <Group>
          {APPEARANCE.map((o, idx) => (
            <Row
              key={o.value}
              first={idx === 0}
              onPress={() => setPref(o.value)}
              a11y={o.label}
              selected={pref === o.value}
              trailing={<Text style={[styles.check, { color: c.ink, opacity: pref === o.value ? 1 : 0 }]}>✓</Text>}
            >
              <RowTitle>{o.label}</RowTitle>
              {o.meta && <RowMeta>{o.meta}</RowMeta>}
            </Row>
          ))}
        </Group>
        <SectionLabel>Your data</SectionLabel>
        <Group>
          <Row first>
            <RowTitle>Photos and reports stay on this phone</RowTitle>
            <RowMeta>Only photo fingerprints are sent, for timestamp receipts. Back up with iCloud.</RowMeta>
          </Row>
          <Row
            trailing={<Switch accessibilityLabel="Suggest notes from photos" value={suggest} onValueChange={toggleSuggest} />}
          >
            <RowTitle>Suggest notes from photos</RowTitle>
            <RowMeta>
              Off by default. When on, tapping Suggest note sends a smaller copy of that one photo to our server, which asks
              an AI model to describe it. The photo is not stored. Suggestions can be wrong, so check before applying.
            </RowMeta>
          </Row>
        </Group>
        <SectionLabel>About</SectionLabel>
        <Group>
          <Row first trailing={<Text style={[styles.version, { color: c.ink60 }]}>{Constants.expoConfig?.version ?? ''}</Text>}>
            <RowTitle>Version</RowTitle>
          </Row>
          <Row>
            <RowTitle>Not legal advice</RowTitle>
            <RowMeta>Reports document condition. They are not a legal opinion.</RowMeta>
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
