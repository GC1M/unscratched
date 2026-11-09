import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { createInspectionFromTemplate } from '@/db/repo';
import { useTheme } from '@/theme';

const orNull = (s: string) => s.trim() || null;

export default function NewInspection() {
  const { c } = useTheme();
  const [address, setAddress] = useState('');
  const [unit, setUnit] = useState('');
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!address.trim()) {
      setError('Address is required');
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
      });
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
        <Button label="Start inspection" onPress={submit} busy={saving} style={styles.button} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  error: { marginTop: 6, marginLeft: 4, fontSize: 13 },
  button: { marginTop: 32 },
});
