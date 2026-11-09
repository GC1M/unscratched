import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { getDb } from '@/db/client';
import { getInspection } from '@/db/repo';
import { exportReport } from '@/report/export';

// The typed names are passed to the report only. The inspection is finished (locked), so
// nothing on this screen writes to it.
export default function ExportReport() {
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [date, setDate] = useState<number | null>(null);
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const inspection = await getInspection(await getDb(), inspectionId);
      setDate(inspection?.finished_at ?? Date.now());
      setTenant(inspection?.tenant_name ?? '');
      setLandlord(inspection?.landlord_name ?? '');
    })();
  }, [inspectionId]);

  const disabled = busy || date == null || !tenant.trim();

  const submit = async () => {
    if (disabled || date == null) return;
    setBusy(true);
    try {
      await exportReport(await getDb(), inspectionId, {
        tenantName: tenant.trim(),
        landlordName: landlord.trim() || null,
        date,
      });
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Export report' }} />
      {date != null && (
        <Text style={styles.statement}>
          I confirm this report reflects the unit&apos;s condition on {new Date(date).toLocaleDateString()}.
        </Text>
      )}
      <Text style={styles.label}>Tenant typed name (required)</Text>
      <TextInput style={styles.input} value={tenant} onChangeText={setTenant} accessibilityLabel="Tenant typed name" />
      <Text style={styles.label}>Landlord or manager typed name</Text>
      <TextInput
        style={styles.input}
        value={landlord}
        onChangeText={setLandlord}
        accessibilityLabel="Landlord or manager typed name"
      />
      <Pressable
        style={[styles.button, disabled && styles.disabled]}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Export PDF"
        accessibilityState={{ disabled, busy }}
        onPress={submit}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Export PDF</Text>}
      </Pressable>
      {busy && <Text style={styles.status}>Building PDF...</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', flexGrow: 1 },
  statement: { fontSize: 16, marginBottom: 8 },
  label: { marginTop: 12, marginBottom: 4, fontSize: 15, fontWeight: '500' },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: '#1a73e8', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  status: { marginTop: 8, textAlign: 'center', color: '#666' },
});
