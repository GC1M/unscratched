import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { getInspection } from '@/db/repo';
import { exportReport } from '@/report/export';
import { exportPhotosZip } from '@/report/exportPhotosZip';
import { serifItalic, useTheme } from '@/theme';

// The typed names are passed to the report only. The inspection is finished (locked), so
// nothing on this screen writes to it.
export default function ExportReport() {
  const { c } = useTheme();
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [date, setDate] = useState<number | null>(null);
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const inspection = await getInspection(await getDb(), inspectionId);
      setDate(inspection?.finished_at ?? Date.now());
      setTenant(inspection?.tenant_name ?? '');
      setLandlord(inspection?.landlord_name ?? '');
    })().catch((e: unknown) => Alert.alert('Could not load inspection', errorMessage(e)));
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

  // Does not need the typed names: the zip is just the photo files plus a manifest.
  const shareZip = async () => {
    if (zipBusy) return;
    setZipBusy(true);
    try {
      await exportPhotosZip(await getDb(), inspectionId);
    } catch (e) {
      Alert.alert('Photo export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Export report', headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      <Screen>
        {date != null && (
          <Text style={[styles.statement, { color: c.ink }]}>
            I confirm this report reflects the unit&apos;s condition on{' '}
            {new Date(date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
          </Text>
        )}
        <SectionLabel>Tenant typed name</SectionLabel>
        <Field signature value={tenant} onChangeText={setTenant} accessibilityLabel="Tenant typed name" placeholder="Required" />
        <SectionLabel>Landlord or manager typed name</SectionLabel>
        <Field signature value={landlord} onChangeText={setLandlord} accessibilityLabel="Landlord or manager typed name" placeholder="Optional" />
        <Button label={busy ? 'Building PDF' : 'Export PDF'} a11y="Export PDF" onPress={submit} disabled={disabled} busy={busy} style={styles.button} />
        <Button label="Share full-resolution photos (.zip)" variant="secondary" onPress={shareZip} busy={zipBusy} style={styles.zip} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  statement: { fontFamily: serifItalic, fontSize: 22, lineHeight: 29, marginBottom: 8, marginHorizontal: 4 },
  button: { marginTop: 40 },
  zip: { marginTop: 10 },
});
