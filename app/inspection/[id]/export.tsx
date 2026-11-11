import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { SignaturePad } from '@/components/SignaturePad';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { getInspection, recordSent } from '@/db/repo';
import { validatePortalUrl } from '@/lib/portalUrl';
import { exportReport, sendReport } from '@/report/export';
import { exportPhotosZip } from '@/report/exportPhotosZip';
import { serifItalic, useTheme } from '@/theme';

// The typed names and drawn signature are passed to the report only. The inspection is finished (locked); the only
// write here is the delivery record after sending, which the lock allows.
export default function ExportReport() {
  const { c } = useTheme();
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [date, setDate] = useState<number | null>(null);
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [portal, setPortal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  // Set when the inspection is missing or not finished (e.g. a crafted deep link): show why, not the form.
  const [refusal, setRefusal] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    (async () => {
      const inspection = await getInspection(await getDb(), inspectionId);
      if (!inspection) return setRefusal({ title: 'Inspection not found', body: 'It may have been deleted.' });
      if (inspection.finished_at == null) {
        return setRefusal({ title: 'Not finished yet', body: 'Finish and lock this inspection before exporting its report.' });
      }
      setDate(inspection.finished_at);
      setTenant(inspection.tenant_name ?? '');
      setLandlord(inspection.landlord_name ?? '');
      setPortal(validatePortalUrl(inspection.portal_url ?? ''));
    })().catch((e: unknown) => Alert.alert('Could not load inspection', errorMessage(e)));
  }, [inspectionId]);

  const disabled = busy || date == null || !tenant.trim();
  const ack = (at: number) => ({ tenantName: tenant.trim(), landlordName: landlord.trim() || null, date: at, tenantSignature: signature });

  const submit = async () => {
    if (disabled || date == null) return;
    setBusy(true);
    try {
      await exportReport(await getDb(), inspectionId, ack(date));
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPortal = () =>
    Alert.alert('Did you send it through the portal?', undefined, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Yes, I sent it',
        onPress: async () => {
          try {
            await recordSent(await getDb(), inspectionId, 'portal');
          } catch (e) {
            Alert.alert('Could not save', errorMessage(e));
          }
        },
      },
    ]);

  const offerPortal = (url: string) =>
    Alert.alert('Open landlord portal?', 'Attach the PDF to a message or maintenance request.', [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Open portal',
        onPress: () =>
          Linking.openURL(url)
            .then(confirmPortal)
            .catch((e: unknown) => Alert.alert('Could not open the portal', errorMessage(e))),
      },
    ]);

  const send = async () => {
    if (disabled || sending || date == null) return;
    setSending(true);
    try {
      const channel = await sendReport(await getDb(), inspectionId, ack(date));
      if (channel === 'share' && portal) offerPortal(portal);
    } catch (e) {
      Alert.alert('Send failed', errorMessage(e));
    } finally {
      setSending(false);
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

  const header = <Stack.Screen options={{ title: 'Export report', headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;
  if (refusal || date == null)
    return (
      <>
        {header}
        <Screen>{refusal ? <Problem title={refusal.title} body={refusal.body} /> : <Loading />}</Screen>
      </>
    );

  return (
    <>
      {header}
      <Screen>
        <Text style={[styles.statement, { color: c.ink }]}>
          I confirm this report reflects the unit&apos;s condition on{' '}
          {new Date(date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.
        </Text>
        <SectionLabel>Tenant typed name</SectionLabel>
        <Field signature value={tenant} onChangeText={setTenant} accessibilityLabel="Tenant typed name" placeholder="Required" />
        <SectionLabel>Tenant signature (optional)</SectionLabel>
        <SignaturePad onDone={setSignature} />
        <SectionLabel>Landlord or manager typed name</SectionLabel>
        <Field signature value={landlord} onChangeText={setLandlord} accessibilityLabel="Landlord or manager typed name" placeholder="Optional" />
        <Button label={busy ? 'Building PDF' : 'Export PDF'} a11y="Export PDF" onPress={submit} disabled={disabled} busy={busy} style={styles.button} />
        <Button label={sending ? 'Preparing' : 'Send to landlord'} a11y="Send to landlord" variant="secondary" onPress={send} disabled={disabled || sending} busy={sending} style={styles.zip} />
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
