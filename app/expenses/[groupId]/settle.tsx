import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { currentUserId, loadGroup, localToday, recordSettlement } from '@/expenses/api';
import { parseCents } from '@/expenses/split';
import type { GroupData } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

/** Records a payment of any amount between any two members, on any date. */
export default function Settle() {
  const { c } = useTheme();
  const { t } = useT();
  const params = useLocalSearchParams<{ groupId: string; from?: string; to?: string; cents?: string }>();
  const groupId = params.groupId;
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(params.from ?? '');
  const [to, setTo] = useState(params.to ?? '');
  const [amount, setAmount] = useState(params.cents ? (Number(params.cents) / 100).toFixed(2) : '');
  const [date, setDate] = useState(localToday());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([loadGroup(groupId), currentUserId()]).then(([d, me]) => {
      setData(d);
      setFrom((f) => f || me || '');
    }, (e: unknown) => setError(errorMessage(e)));
  }, [groupId]);

  const header = <Stack.Screen options={{ title: t('exp.recordPayment'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;
  if (error || !data)
    return (
      <>
        {header}
        <Screen>{error ? <Problem title={t('exp.loadError')} body={error} /> : <Loading />}</Screen>
      </>
    );

  const people = data.members.filter((m) => !m.left_at).map((m) => ({ value: m.user_id, label: m.display_name }));
  const cents = parseCents(amount);
  const ready = !!from && !!to && from !== to && !!cents && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date));

  const save = async () => {
    if (!ready || saving) return;
    setSaving(true);
    try {
      await recordSettlement(groupId, from, to, cents!, date);
      router.back();
    } catch (e) {
      Alert.alert(t('exp.failed'), errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <>
      {header}
      <Screen>
        <SectionLabel>{t('exp.payer')}</SectionLabel>
        <Chips options={people} selected={[from]} onToggle={setFrom} a11y={t('exp.payer')} />
        <SectionLabel>{t('exp.recipient')}</SectionLabel>
        <Chips options={people} selected={[to]} onToggle={setTo} a11y={t('exp.recipient')} />
        <SectionLabel>{t('exp.amount', { currency: data.group.currency })}</SectionLabel>
        <Field value={amount} onChangeText={setAmount} accessibilityLabel={t('exp.amount', { currency: data.group.currency })} keyboardType="decimal-pad" placeholder="0.00" />
        <SectionLabel>{t('exp.date')}</SectionLabel>
        <Field value={date} onChangeText={setDate} accessibilityLabel={t('exp.date')} placeholder="YYYY-MM-DD" autoCapitalize="none" />
        <Button label={t('exp.recordPayment')} disabled={!ready} busy={saving} onPress={save} style={styles.button} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({ button: { marginTop: 32 } });
