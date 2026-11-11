import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { createInspectionFromTemplate, getSetting, setSetting } from '@/db/repo';
import { useT } from '@/i18n/context';
import { lookupDepositDeadline } from '@/legal/depositDeadlines';
import { parseDate } from '@/lib/reminders';
import { scheduleReminders } from '@/lib/scheduleReminders';
import type { Region } from '@/templates/rooms';
import { radius, useTheme } from '@/theme';

const orNull = (s: string) => s.trim() || null;

const REGION_KEY = 'region';
const REGIONS: Region[] = ['US', 'UK', 'CA'];

export default function NewInspection() {
  const { c } = useTheme();
  const { t } = useT();
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [moveOut, setMoveOut] = useState('');
  const [usState, setUsState] = useState('');
  const [stateError, setStateError] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [region, setRegion] = useState<Region>('US');

  useEffect(() => {
    getDb()
      .then((db) => getSetting(db, REGION_KEY))
      .then((saved) => {
        const match = REGIONS.find((r) => r === saved);
        if (match) setRegion(match);
      })
      .catch(() => {});
  }, []);

  async function submit() {
    if (!address.trim()) {
      setError(t('new.addressRequired'));
      return;
    }
    const moveOutDate = moveOut.trim() ? parseDate(moveOut) : null;
    if (moveOut.trim() && moveOutDate === null) {
      setDateError(t('new.dateError'));
      return;
    }
    // The deadline table is US only; a state typed before switching region is ignored.
    const stateText = region === 'US' ? usState.trim() : '';
    const stateRow = stateText ? lookupDepositDeadline(stateText) : undefined;
    if (stateText && !stateRow) {
      setStateError(t('new.stateError'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const db = await getDb();
      const id = await createInspectionFromTemplate(
        db,
        {
          address: address.trim(),
          unit: orNull(unit),
          tenant_name: orNull(tenant),
          landlord_name: orNull(landlord),
          move_out_date: moveOutDate,
          state: stateRow?.code ?? null,
        },
        undefined,
        region,
      );
      // Remembering the region is a convenience; it must not block the saved inspection.
      await setSetting(db, REGION_KEY, region).catch(() => {});
      // The inspection is saved either way; a scheduling failure must not block it.
      if (moveOutDate !== null) await scheduleReminders(id, moveOutDate).catch(() => {});
      router.replace(`/inspection/${id}`);
    } catch (e) {
      setError(t('new.createError', { error: String(e) }));
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t('new.title'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      <Screen>
        <SectionLabel>{t('new.address')}</SectionLabel>
        <Field value={address} onChangeText={(t) => { setAddress(t); setError(null); }} accessibilityLabel={t('new.address')} placeholder="12 Elm Street" />
        {error && <Text style={[styles.error, { color: c.damaged }]}>{error}</Text>}
        <SectionLabel>{t('new.unit')}</SectionLabel>
        <Field value={unit} onChangeText={setUnit} accessibilityLabel={t('new.unit')} placeholder={t('common.optional')} />
        <SectionLabel>{t('new.tenant')}</SectionLabel>
        <Field value={tenant} onChangeText={setTenant} accessibilityLabel={t('new.tenant')} placeholder={t('common.optional')} />
        <SectionLabel>{t('new.landlord')}</SectionLabel>
        <Field value={landlord} onChangeText={setLandlord} accessibilityLabel={t('new.landlord')} placeholder={t('common.optional')} />
        <SectionLabel>{t('new.moveOut')}</SectionLabel>
        <Field
          value={moveOut}
          onChangeText={(t) => { setMoveOut(t); setDateError(null); }}
          placeholder={t('new.moveOutPlaceholder')}
          autoCapitalize="none"
          accessibilityLabel={t('new.moveOut')}
        />
        {dateError && <Text style={[styles.error, { color: c.damaged }]}>{dateError}</Text>}
        <SectionLabel>{t('new.templates')}</SectionLabel>
        <View style={[styles.track, { backgroundColor: c.hair }]} accessibilityRole="radiogroup">
          {REGIONS.map((r) => {
            const selected = region === r;
            const label = t(`new.region.${r}`);
            return (
              <Pressable
                key={r}
                accessibilityRole="radio"
                accessibilityLabel={t('new.regionA11y', { region: label })}
                accessibilityState={{ selected }}
                onPress={() => setRegion(r)}
                style={({ pressed }) => [
                  styles.option,
                  selected && { backgroundColor: c.paper, borderColor: c.ink },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[styles.optionText, { color: c.ink }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
        {region === 'US' && (
          <>
            <SectionLabel>{t('new.state')}</SectionLabel>
            <Field
              value={usState}
              onChangeText={(t) => { setUsState(t); setStateError(null); }}
              placeholder={t('new.statePlaceholder')}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={2}
              accessibilityLabel={t('new.state')}
            />
            {stateError && <Text style={[styles.error, { color: c.damaged }]}>{stateError}</Text>}
          </>
        )}
        <Button label={t('new.start')} onPress={submit} busy={saving} style={styles.button} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: 6, marginLeft: 4, fontSize: 13 },
  button: { marginTop: 32 },
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.capsule },
  option: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.capsule - 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: { fontSize: 16, fontWeight: '500' },
});
