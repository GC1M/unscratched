import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { SignaturePad } from '@/components/SignaturePad';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { getInspection, recordSent } from '@/db/repo';
import { useT } from '@/i18n/context';
import { validatePortalUrl } from '@/lib/portalUrl';
import { exportReport, sendReport } from '@/report/export';
import { exportPhotosZip } from '@/report/exportPhotosZip';
import type { Roommate } from '@/report/types';
import { serifItalic, useTheme } from '@/theme';

// The typed names and drawn signature are passed to the report only. The inspection is finished (locked); the only
// write here is the delivery record after sending, which the lock allows.
export default function ExportReport() {
  const { c } = useTheme();
  const { t, lang, locale } = useT();
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [date, setDate] = useState<number | null>(null);
  const [tenant, setTenant] = useState('');
  const [landlord, setLandlord] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  // key keeps each roommate's signature pad (which holds its own strokes) attached to the right row on removal.
  const [roommates, setRoommates] = useState<(Roommate & { key: number })[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [portal, setPortal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  // Set when the inspection is missing or not finished (e.g. a crafted deep link): show why, not the form.
  const [refusal, setRefusal] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    (async () => {
      const inspection = await getInspection(await getDb(), inspectionId);
      if (!inspection) return setRefusal({ title: t('common.inspectionNotFound'), body: t('common.mayBeDeleted') });
      if (inspection.finished_at == null) {
        return setRefusal({ title: t('export.notFinished'), body: t('export.notFinishedBody') });
      }
      setDate(inspection.finished_at);
      setTenant(inspection.tenant_name ?? '');
      setLandlord(inspection.landlord_name ?? '');
      setPortal(validatePortalUrl(inspection.portal_url ?? ''));
    })().catch((e: unknown) => Alert.alert(t('export.loadError'), errorMessage(e)));
  }, [inspectionId, t]);

  const disabled = busy || date == null || !tenant.trim();
  const ack = (at: number) => ({
    tenantName: tenant.trim(),
    landlordName: landlord.trim() || null,
    date: at,
    tenantSignature: signature,
    roommates: roommates.map(({ name, signature }) => ({ name, signature })),
  });
  const editRoommate = (key: number, patch: Partial<Roommate>) =>
    setRoommates((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRoommate = () =>
    setRoommates((rs) => [...rs, { key: (rs[rs.length - 1]?.key ?? 0) + 1, name: '', signature: null }]);

  const submit = async () => {
    if (disabled || date == null) return;
    setBusy(true);
    try {
      await exportReport(await getDb(), inspectionId, ack(date), lang);
    } catch (e) {
      Alert.alert(t('export.failed'), e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmPortal = () =>
    Alert.alert(t('export.portalAsk'), undefined, [
      { text: t('common.notYet'), style: 'cancel' },
      {
        text: t('export.portalYes'),
        onPress: async () => {
          try {
            await recordSent(await getDb(), inspectionId, 'portal');
          } catch (e) {
            Alert.alert(t('export.saveError'), errorMessage(e));
          }
        },
      },
    ]);

  const offerPortal = (url: string) =>
    Alert.alert(t('export.openPortalTitle'), t('export.openPortalBody'), [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('export.openPortal'),
        onPress: () =>
          Linking.openURL(url)
            .then(confirmPortal)
            .catch((e: unknown) => Alert.alert(t('export.portalError'), errorMessage(e))),
      },
    ]);

  const send = async () => {
    if (disabled || sending || date == null) return;
    setSending(true);
    try {
      const channel = await sendReport(await getDb(), inspectionId, ack(date), lang);
      if (channel === 'share' && portal) offerPortal(portal);
    } catch (e) {
      Alert.alert(t('export.sendFailed'), errorMessage(e));
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
      Alert.alert(t('export.zipFailed'), e instanceof Error ? e.message : String(e));
    } finally {
      setZipBusy(false);
    }
  };

  // No swipe back here: iOS starts its back swipe natively, before the signature pad can claim a rightward stroke.
  // The back button still works.
  const header = (
    <Stack.Screen options={{ title: t('common.exportReport'), headerLargeTitleStyle: { fontSize: 34, color: c.ink }, gestureEnabled: false }} />
  );
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
      <Screen scrollEnabled={!drawing}>
        <Text style={[styles.statement, { color: c.ink }]}>
          {t('export.statement', { date: new Date(date).toLocaleDateString(locale, { month: 'long', day: 'numeric', year: 'numeric' }) })}
        </Text>
        <SectionLabel>{t('export.tenantName')}</SectionLabel>
        <Field signature value={tenant} onChangeText={setTenant} accessibilityLabel={t('export.tenantName')} placeholder={t('export.required')} />
        <SectionLabel>{t('export.signature')}</SectionLabel>
        <SignaturePad onDone={setSignature} onDrawing={setDrawing} />
        {roommates.map((r, i) => {
          const n = i + 1;
          return (
            <View key={r.key}>
              <SectionLabel>{t('export.roommateName', { n })}</SectionLabel>
              <Field signature value={r.name} onChangeText={(name) => editRoommate(r.key, { name })} accessibilityLabel={t('export.roommateName', { n })} />
              <SectionLabel>{t('export.roommateSignature', { n })}</SectionLabel>
              <SignaturePad label={t('export.roommatePad', { n })} onDone={(sig) => editRoommate(r.key, { signature: sig })} onDrawing={setDrawing} />
              <Button
                label={t('export.removeRoommate')}
                a11y={t('export.removeRoommateA11y', { n })}
                variant="tertiary"
                onPress={() => setRoommates((rs) => rs.filter((x) => x.key !== r.key))}
                style={styles.zip}
              />
            </View>
          );
        })}
        <Button label={t('export.addRoommate')} variant="secondary" onPress={addRoommate} style={styles.zip} />
        <SectionLabel>{t('export.landlordName')}</SectionLabel>
        <Field signature value={landlord} onChangeText={setLandlord} accessibilityLabel={t('export.landlordName')} placeholder={t('common.optional')} />
        <Button label={t(busy ? 'export.buildingPdf' : 'export.exportPdf')} a11y={t('export.exportPdf')} onPress={submit} disabled={disabled} busy={busy} style={styles.button} />
        <Button label={t(sending ? 'export.preparing' : 'export.send')} a11y={t('export.send')} variant="secondary" onPress={send} disabled={disabled || sending} busy={sending} style={styles.zip} />
        <Button label={t('export.zip')} variant="secondary" onPress={shareZip} busy={zipBusy} style={styles.zip} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  statement: { fontFamily: serifItalic, fontSize: 22, lineHeight: 29, marginBottom: 8, marginHorizontal: 4 },
  button: { marginTop: 40 },
  zip: { marginTop: 10 },
});
