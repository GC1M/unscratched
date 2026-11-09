import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { getDb } from '@/db/client';
import { createInspectionFromTemplate } from '@/db/repo';

const orNull = (s: string) => s.trim() || null;

export default function NewInspection() {
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
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'New move-in inspection' }} />
      <Text style={styles.label}>Address (required)</Text>
      <TextInput style={styles.input} value={address} onChangeText={(t) => { setAddress(t); setError(null); }} accessibilityLabel="Address" />
      {error && <Text style={styles.error}>{error}</Text>}
      <Text style={styles.label}>Unit</Text>
      <TextInput style={styles.input} value={unit} onChangeText={setUnit} accessibilityLabel="Unit" />
      <Text style={styles.label}>Tenant name</Text>
      <TextInput style={styles.input} value={tenant} onChangeText={setTenant} accessibilityLabel="Tenant name" />
      <Text style={styles.label}>Landlord or manager name</Text>
      <TextInput
        style={styles.input}
        value={landlord}
        onChangeText={setLandlord}
        accessibilityLabel="Landlord or manager name"
      />
      <Pressable
        style={[styles.button, saving && styles.disabled]}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel="Start inspection"
        accessibilityState={{ disabled: saving }}
        onPress={submit}
      >
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Start inspection'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  label: { marginTop: 12, marginBottom: 4, fontSize: 15, fontWeight: '500' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  error: { marginTop: 4, color: '#c5221f' },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: '#1a73e8', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
