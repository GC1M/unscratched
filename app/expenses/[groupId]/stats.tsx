import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { loadGroup } from '@/expenses/api';
import { byCategory, byMonth, spentPerMember } from '@/expenses/report';
import { formatCents } from '@/expenses/split';
import type { GroupData } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

/** Spending by category, by month, and per member, as plain horizontal bars. */
export default function Stats() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const groupId = useLocalSearchParams<{ groupId: string }>().groupId;
  const [data, setData] = useState<GroupData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadGroup(groupId).then(setData, (e: unknown) => setError(errorMessage(e)));
  }, [groupId]);

  const header = <Stack.Screen options={{ title: t('exp.stats'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;
  if (error || !data)
    return (
      <>
        {header}
        <Screen>{error ? <Problem title={t('exp.loadError')} body={error} /> : <Loading />}</Screen>
      </>
    );

  const money = (cents: number) => formatCents(cents, data.group.currency, locale);
  const names = Object.fromEntries(data.members.map((m) => [m.user_id, m.display_name]));
  const total = data.expenses.reduce((s, e) => s + e.amount_cents, 0);
  const perMember = spentPerMember(data.expenses);

  return (
    <>
      {header}
      <Screen>
        {data.expenses.length === 0 ? (
          <Text style={[styles.total, { color: c.ink60 }]}>{t('exp.noActivity')}</Text>
        ) : (
          <>
            <Text style={[styles.total, { color: c.ink }]}>{t('exp.totalSpent', { amount: money(total) })}</Text>
            <SectionLabel>{t('exp.byCategory')}</SectionLabel>
            <Bars money={money} rows={byCategory(data.expenses).map((r) => ({ label: t(`exp.cat.${r.key}` as never), cents: r.cents }))} />
            <SectionLabel>{t('exp.byMonth')}</SectionLabel>
            <Bars
              money={money}
              rows={byMonth(data.expenses).map((r) => ({
                label: new Date(`${r.key}-15T12:00:00`).toLocaleDateString(locale, { month: 'short', year: 'numeric' }),
                cents: r.cents,
              }))}
            />
            <SectionLabel>{t('exp.byMember')}</SectionLabel>
            <Bars money={money} rows={data.members.map((m) => ({ label: names[m.user_id], cents: perMember[m.user_id] ?? 0 }))} />
          </>
        )}
      </Screen>
    </>
  );
}

function Bars({ rows, money }: { rows: { label: string; cents: number }[]; money: (cents: number) => string }) {
  const { c } = useTheme();
  const max = Math.max(1, ...rows.map((r) => r.cents));
  return (
    <View style={styles.bars}>
      {rows.map((r) => (
        <View key={r.label} accessible accessibilityLabel={`${r.label}, ${money(r.cents)}`}>
          <View style={styles.barLabels}>
            <Text style={[styles.label, { color: c.ink }]}>{r.label}</Text>
            <Text style={[styles.label, { color: c.ink60 }]}>{money(r.cents)}</Text>
          </View>
          <View style={[styles.track, { backgroundColor: c.hair }]}>
            <View style={[styles.fill, { backgroundColor: c.ink, width: `${(r.cents / max) * 100}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  total: { fontSize: 20, marginHorizontal: 4, marginBottom: 8 },
  bars: { gap: 14, marginTop: 4 },
  barLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 15 },
  track: { height: 10, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 10, borderRadius: 5 },
});
