import { File, Paths } from 'expo-file-system';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Share, StyleSheet, Text, type AlertButton } from 'react-native';

import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { currentUserId, deleteRecurring, deleteSettlement, loadGroup, recordSettlement, watchGroup } from '@/expenses/api';
import { searchExpenses, toCsv } from '@/expenses/report';
import { balances, formatCents, pairwiseDebts, simplifyDebts } from '@/expenses/split';
import type { GroupData } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

/**
 * One group: balances, who pays whom (simplified or not), expenses and payments with search, recurring expenses, invite,
 * and CSV export. Refreshes live when anything changes on another phone.
 */
export default function ExpenseGroup() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const groupId = useLocalSearchParams<{ groupId: string }>().groupId;
  const [data, setData] = useState<GroupData | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, id] = await Promise.all([loadGroup(groupId), currentUserId()]);
      setData(d);
      setMe(id);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => watchGroup(groupId, load), [groupId, load]);

  const names = useMemo(() => Object.fromEntries((data?.members ?? []).map((m) => [m.user_id, m.display_name])), [data]);
  const bal = useMemo(
    () =>
      data
        ? balances(
            data.expenses.map((e) => ({ payerId: e.payer_id, payers: e.payers, amountCents: e.amount_cents, shares: e.shares })),
            data.settlements.map((s) => ({ fromId: s.from_id, toId: s.to_id, amountCents: s.amount_cents })),
          )
        : {},
    [data],
  );
  const payments = useMemo(
    () =>
      !data
        ? []
        : data.group.simplify_debts
          ? simplifyDebts(bal)
          : pairwiseDebts(
              data.expenses.map((e) => ({ payerId: e.payer_id, payers: e.payers, amountCents: e.amount_cents, shares: e.shares })),
              data.settlements.map((s) => ({ fromId: s.from_id, toId: s.to_id, amountCents: s.amount_cents })),
            ),
    [data, bal],
  );

  const header = (title: string) => (
    <Stack.Screen options={{ title, headerLargeTitleStyle: { fontSize: 34, color: c.ink } }}>
      {data && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="gearshape" accessibilityLabel={t('exp.settings')} onPress={() => router.push(`/expenses/${groupId}/settings`)} />
          <Stack.Toolbar.Button icon="clock" accessibilityLabel={t('exp.history')} onPress={() => router.push(`/expenses/${groupId}/history`)} />
          <Stack.Toolbar.Button icon="chart.bar" accessibilityLabel={t('exp.stats')} onPress={() => router.push(`/expenses/${groupId}/stats`)} />
          <Stack.Toolbar.Button icon="plus" accessibilityLabel={t('exp.addExpense')} onPress={() => router.push(`/expenses/${groupId}/expense`)} />
        </Stack.Toolbar>
      )}
    </Stack.Screen>
  );

  if (error || !data)
    return (
      <>
        {header(t('exp.title'))}
        <Screen>{error ? <Problem title={t('exp.loadError')} body={error} onRetry={load} /> : <Loading />}</Screen>
      </>
    );

  const money = (cents: number) => formatCents(cents, data.group.currency, locale);
  const who = (id: string) => (id === me ? t('exp.you') : (names[id] ?? '?'));

  // Tapping a suggested payment: record it in full, record another amount, remind the debtor, or pay with Venmo.
  const settle = (fromId: string, toId: string, cents: number) => {
    const buttons: AlertButton[] = [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('exp.settleYes'),
        onPress: () => recordSettlement(groupId, fromId, toId, cents).then(load, (e: unknown) => Alert.alert(t('exp.failed'), errorMessage(e))),
      },
      { text: t('exp.otherAmount'), onPress: () => router.push(`/expenses/${groupId}/settle?from=${fromId}&to=${toId}&cents=${cents}`) },
    ];
    if (toId === me)
      buttons.push({
        text: t('exp.remind'),
        onPress: () => Share.share({ message: t('exp.remindMessage', { name: names[fromId] ?? '', amount: money(cents), group: data.group.name }) }),
      });
    if (fromId === me && data.group.currency === 'USD')
      buttons.push({
        text: t('exp.payVenmo'),
        onPress: () =>
          Linking.openURL(`venmo://paycharge?txn=pay&amount=${(cents / 100).toFixed(2)}&note=${encodeURIComponent(data.group.name)}`).catch(() =>
            Alert.alert(t('exp.noVenmo')),
          ),
      });
    Alert.alert(t('exp.settleTitle'), t('exp.settleBody', { from: who(fromId), to: who(toId), amount: money(cents) }), buttons);
  };

  const confirmDelete = (title: string, action: () => Promise<void>) =>
    Alert.alert(title, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exp.delete'), style: 'destructive', onPress: () => action().then(load, (e: unknown) => Alert.alert(t('exp.failed'), errorMessage(e))) },
    ]);

  const exportCsv = async () => {
    try {
      const file = new File(Paths.cache, `${data.group.name.replace(/[^\w -]/g, '').trim() || 'expenses'}.csv`);
      file.create({ overwrite: true });
      file.write(toCsv(data));
      await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text' });
    } catch (e) {
      Alert.alert(t('exp.failed'), errorMessage(e));
    }
  };

  const activity = [
    ...searchExpenses(data.expenses, query, names).map((e) => ({ kind: 'expense' as const, date: e.spent_on, at: e.created_at, e })),
    ...(query.trim() ? [] : data.settlements.map((s) => ({ kind: 'payment' as const, date: s.settled_on, at: s.created_at, s }))),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));

  return (
    <>
      {header(data.group.name)}
      <Screen>
        <SectionLabel>{t('exp.balances')}</SectionLabel>
        <Group>
          {data.members.filter((m) => !m.left_at).map((m, i) => {
            const v = bal[m.user_id] ?? 0;
            return (
              <Row key={m.user_id} first={i === 0}>
                <RowTitle>{m.placeholder ? t('exp.notJoined', { name: m.display_name }) : who(m.user_id)}</RowTitle>
                <RowMeta>
                  {v === 0 ? t('exp.settledUp') : t(v > 0 ? 'exp.isOwed' : 'exp.owes', { amount: money(Math.abs(v)) })}
                </RowMeta>
              </Row>
            );
          })}
        </Group>

        {payments.length > 0 && (
          <>
            <SectionLabel>{t(data.group.simplify_debts ? 'exp.suggested' : 'exp.whoOwes')}</SectionLabel>
            <Group>
              {payments.map((p, i) => (
                <Row
                  key={`${p.fromId}-${p.toId}`}
                  first={i === 0}
                  onPress={() => settle(p.fromId, p.toId, p.amountCents)}
                  a11y={t('exp.paysA11y', { from: who(p.fromId), to: who(p.toId), amount: money(p.amountCents) })}
                >
                  <RowTitle>{t('exp.pays', { from: who(p.fromId), to: who(p.toId) })}</RowTitle>
                  <RowMeta>{money(p.amountCents)}</RowMeta>
                </Row>
              ))}
            </Group>
          </>
        )}
        <Button label={t('exp.recordPayment')} variant="secondary" onPress={() => router.push(`/expenses/${groupId}/settle`)} style={styles.small} />

        <SectionLabel>{t('exp.activity')}</SectionLabel>
        <Field value={query} onChangeText={setQuery} accessibilityLabel={t('exp.search')} placeholder={t('exp.search')} autoCapitalize="none" clearButtonMode="while-editing" />
        {activity.length === 0 ? (
          <Text style={[styles.empty, { color: c.ink60 }]}>{t(query.trim() ? 'exp.noMatches' : 'exp.noActivity')}</Text>
        ) : (
          <Group style={styles.list}>
            {activity.map((a, i) =>
              a.kind === 'expense' ? (
                <Row key={a.e.id} first={i === 0} onPress={() => router.push(`/expenses/${groupId}/expense?id=${a.e.id}`)} a11y={a.e.description}>
                  <RowTitle>{a.e.description}</RowTitle>
                  <RowMeta>
                    {Object.keys(a.e.payers).length > 1
                      ? t('exp.paidBySeveral', { count: Object.keys(a.e.payers).length, amount: money(a.e.amount_cents) })
                      : t('exp.paidBy', { who: who(a.e.payer_id), amount: money(a.e.amount_cents) })}
                    {a.e.original_currency && a.e.original_amount_cents ? ` (${formatCents(a.e.original_amount_cents, a.e.original_currency, locale)})` : ''} · {t(`exp.cat.${a.e.category}`)} · {a.e.spent_on}
                    {a.e.recurring_id ? ` · ${t('exp.repeats')}` : ''}
                    {a.e.receipt_path ? ` · ${t('exp.hasReceipt')}` : ''}
                  </RowMeta>
                </Row>
              ) : (
                <Row key={a.s.id} first={i === 0} onPress={() => confirmDelete(t('exp.deletePayment'), () => deleteSettlement(a.s.id))} a11y={t('exp.payment')}>
                  <RowTitle>{t('exp.paid', { from: who(a.s.from_id), to: who(a.s.to_id) })}</RowTitle>
                  <RowMeta>{money(a.s.amount_cents)} · {a.s.settled_on}</RowMeta>
                </Row>
              ),
            )}
          </Group>
        )}

        {data.recurring.length > 0 && (
          <>
            <SectionLabel>{t('exp.recurring')}</SectionLabel>
            <Group>
              {data.recurring.map((r, i) => (
                <Row key={r.id} first={i === 0} onPress={() => confirmDelete(t('exp.stopRecurring'), () => deleteRecurring(r.id))} a11y={r.description}>
                  <RowTitle>{r.description}</RowTitle>
                  <RowMeta>
                    {money(r.amount_cents)} · {t(`exp.every.${r.every}`)} · {t('exp.next', { date: r.next_on })}
                  </RowMeta>
                </Row>
              ))}
            </Group>
          </>
        )}

        <SectionLabel>{t('exp.invite')}</SectionLabel>
        <Text selectable style={[styles.code, { color: c.ink }]} accessibilityLabel={t('exp.inviteA11y', { code: data.group.invite_code.split('').join(' ') })}>
          {data.group.invite_code}
        </Text>
        <Button label={t('exp.shareInvite')} variant="secondary" onPress={() => Share.share({ message: t('exp.inviteMessage', { group: data.group.name, code: data.group.invite_code }) })} />
        <Button label={t('exp.exportCsv')} variant="secondary" onPress={exportCsv} style={styles.small} />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 15, marginTop: 12, marginHorizontal: 4 },
  list: { marginTop: 12 },
  code: { fontSize: 28, letterSpacing: 4, fontWeight: '600', marginHorizontal: 4, marginBottom: 12 },
  small: { marginTop: 10 },
});
