import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { useTheme, useThemePref, type ThemePref } from '@/theme';

const APPEARANCE: { value: ThemePref; label: string; meta?: string }[] = [
  { value: 'system', label: 'Match iPhone', meta: 'Follows the system setting' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export default function Settings() {
  const { c } = useTheme();
  const { pref, setPref } = useThemePref();
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
            <RowMeta>Nothing is uploaded. Back up with iCloud.</RowMeta>
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
