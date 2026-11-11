import { Stack, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { createInspectionFromTemplate, getSetting, setSetting } from '@/db/repo';
import { parseDate } from '@/lib/reminders';
import { scheduleReminders } from '@/lib/scheduleReminders';
import type { Region } from '@/templates/rooms';
import { radius, useTheme } from '@/theme';

const orNull = (s: string) => s.trim() || null;

const REGION_KEY = 'region';
const REGIONS: { value: Region; label: string }[] = [
  { value: 'US', label: 'US' },
  { value: 'UK', label: 'UK' },
  { value: 'CA', label: 'Canada' },
];

export default function NewInspection() {
  const { c } = useTheme();
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [moveOut, setMoveOut] = useState('');
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [region, setRegion] = useState<Region>('US');

  useEffect(() => {
    getDb()
      .then((db) => getSetting(db, REGION_KEY))
      .then((saved) => {
        const match = REGIONS.find((r) => r.value === saved);
        if (match) setRegion(match.value);
      })
      .catch(() => {});
  }, []);

  async function submit() {
    if (!address.trim()) {
      setError('Address is required');
      return;
    }
    const moveOutDate = moveOut.trim() ? parseDate(moveOut) : null;
    if (moveOut.trim() && moveOutDate === null) {
      setDateError('Use a real date like 2026-08-31');
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
      setError(`Could not create the inspection: ${String(e)}`);
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'New inspection', headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      <Screen>
        <SectionLabel>Address</SectionLabel>
        <Field value={address} onChangeText={(t) => { setAddress(t); setError(null); }} accessibilityLabel="Address" placeholder="12 Elm Street" />
        {error && <Text style={[styles.error, { color: c.damaged }]}>{error}</Text>}
        <SectionLabel>Unit</SectionLabel>
        <Field value={unit} onChangeText={setUnit} accessibilityLabel="Unit" placeholder="Optional" />
        <SectionLabel>Tenant name</SectionLabel>
        <Field value={tenant} onChangeText={setTenant} accessibilityLabel="Tenant name" placeholder="Optional" />
        <SectionLabel>Landlord or manager name</SectionLabel>
        <Field value={landlord} onChangeText={setLandlord} accessibilityLabel="Landlord or manager name" placeholder="Optional" />
        <SectionLabel>Move-out date (YYYY-MM-DD)</SectionLabel>
        <Field
          value={moveOut}
          onChangeText={(t) => { setMoveOut(t); setDateError(null); }}
          placeholder="Optional, for reminders"
          autoCapitalize="none"
          accessibilityLabel="Move-out date (YYYY-MM-DD)"
        />
        {dateError && <Text style={[styles.error, { color: c.damaged }]}>{dateError}</Text>}
        <SectionLabel>Room templates</SectionLabel>
        <View style={[styles.track, { backgroundColor: c.hair }]} accessibilityRole="radiogroup">
          {REGIONS.map((r) => {
            const selected = region === r.value;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="radio"
                accessibilityLabel={`${r.label} room templates`}
                accessibilityState={{ selected }}
                onPress={() => setRegion(r.value)}
                style={({ pressed }) => [
                  styles.option,
                  selected && { backgroundColor: c.paper, borderColor: c.ink },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Text style={[styles.optionText, { color: c.ink }]}>{r.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <Button label="Start inspection" onPress={submit} busy={saving} style={styles.button} />
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
