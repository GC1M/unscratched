import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { createInspectionFromTemplate } from '@/db/repo';
import { parseDate } from '@/lib/reminders';
import { scheduleReminders } from '@/lib/scheduleReminders';
import { useTheme } from '@/theme';

const orNull = (s: string) => s.trim() || null;

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
      const id = await createInspectionFromTemplate(await getDb(), {
        address: address.trim(),
        unit: orNull(unit),
        tenant_name: orNull(tenant),
        landlord_name: orNull(landlord),
        move_out_date: moveOutDate,
      });
      // The inspection is saved either way; a scheduling failure must not block it.
      if (moveOutDate !== null) await scheduleReminders(moveOutDate).catch(() => {});
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
        <Button label="Start inspection" onPress={submit} busy={saving} style={styles.button} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: 6, marginLeft: 4, fontSize: 13 },
  button: { marginTop: 32 },
});
