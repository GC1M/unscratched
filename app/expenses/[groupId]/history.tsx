import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';

import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { currentUserId, deleteExpense, listActivity, loadGroup, watchGroup } from '@/expenses/api';
import { formatCents } from '@/expenses/split';
import type { ActivityRow, GroupData } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

/** Everything that happened in the group, newest first, and recently deleted expenses that can be restored. */
export default function History() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const groupId = useLocalSearchParams<{ groupId: string }>().groupId;
  const [data, setData] = useState<GroupData | null>(null);
  const [feed, setFeed] = useState<ActivityRow[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, f, id] = await Promise.all([loadGroup(groupId), listActivity(groupId), currentUserId()]);
      setData(d);
      setFeed(f);
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

  const header = <Stack.Screen options={{ title: t('exp.history'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;
  if (error || !data)
    return (
      <>
        {header}
        <Screen>{error ? <Problem title={t('exp.loadError')} body={error} onRetry={load} /> : <Loading />}</Screen>
      </>
    );

  const names = Object.fromEntries(data.members.map((m) => [m.user_id, m.display_name]));
  const who = (id: unknown) => (typeof id !== 'string' ? t('exp.someone') : id === me ? t('exp.you') : (names[id] ?? t('exp.someone')));
  const money = (cents: unknown) => (typeof cents === 'number' ? formatCents(cents, data.group.currency, locale) : '');

  const line = (a: ActivityRow) => {
    const d = a.detail;
    return t(`exp.act.${a.kind}` as never, {
      who: a.actor_id ? who(a.actor_id) : t('exp.repeatingRule'),
      desc: String(d.description ?? ''),
      amount: money(d.amount_cents),
      old: money(d.old_amount_cents),
      from: who(d.from_id),
      to: who(d.to_id),
      name: String(d.name ?? ''),
      was: String(d.was ?? ''),
      body: String(d.body ?? ''),
    });
  };

  const restore = (id: string, desc: string) =>
    Alert.alert(t('exp.restoreTitle', { desc }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('exp.restore'), onPress: () => deleteExpense(id, true).then(load, (e: unknown) => Alert.alert(t('exp.failed'), errorMessage(e))) },
    ]);

  return (
    <>
      {header}
      <Screen>
        {data.deleted.length > 0 && (
          <>
            <SectionLabel>{t('exp.recentlyDeleted')}</SectionLabel>
            <Group>
              {data.deleted.map((e, i) => (
                <Row key={e.id} first={i === 0} onPress={() => restore(e.id, e.description)} a11y={t('exp.restoreA11y', { desc: e.description })}>
                  <RowTitle>{e.description}</RowTitle>
                  <RowMeta>{money(e.amount_cents)} · {e.spent_on}</RowMeta>
                </Row>
              ))}
            </Group>
          </>
        )}
        <SectionLabel>{t('exp.history')}</SectionLabel>
        {feed.length === 0 ? (
          <Text style={[styles.empty, { color: c.ink60 }]}>{t('exp.noActivity')}</Text>
        ) : (
          <Group>
            {feed.map((a, i) => (
              <Row key={a.id} first={i === 0}>
                <RowTitle>{line(a)}</RowTitle>
                <RowMeta>{new Date(a.created_at).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })}</RowMeta>
              </Row>
            ))}
          </Group>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({ empty: { fontSize: 15, marginTop: 12, marginHorizontal: 4 } });
