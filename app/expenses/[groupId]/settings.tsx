import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Field } from '@/components/Field';
import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import {
  addPlaceholder, currentUserId, deleteGroup, loadGroup, removeMember, renameMe, resetInvite, updateGroup,
} from '@/expenses/api';
import { balances, formatCents } from '@/expenses/split';
import type { GroupData } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

/** Group settings: names, simplify debts, default split, people (add, remove, leave), invite code, delete group. */
export default function GroupSettings() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const groupId = useLocalSearchParams<{ groupId: string }>().groupId;
  const [data, setData] = useState<GroupData | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [myName, setMyName] = useState('');
  const [newPerson, setNewPerson] = useState('');
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, id] = await Promise.all([loadGroup(groupId), currentUserId()]);
      setData(d);
      setMe(id);
      setGroupName(d.group.name);
      setMyName(d.members.find((m) => m.user_id === id)?.display_name ?? '');
      const def = d.group.default_shares;
      setWeights(def ? Object.fromEntries(Object.entries(def).map(([k, v]) => [k, String(v)])) : {});
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [groupId]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      Alert.alert(t('exp.failed'), errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const confirm = (title: string, body: string | undefined, yes: string, fn: () => Promise<unknown>, after?: () => void) =>
    Alert.alert(title, body, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: yes,
        style: 'destructive',
        onPress: () =>
          fn().then(after ?? load, (e: unknown) => Alert.alert(t('exp.failed'), errorMessage(e))),
      },
    ]);

  const header = <Stack.Screen options={{ title: t('exp.settings'), headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;
  if (error || !data)
    return (
      <>
        {header}
        <Screen>{error ? <Problem title={t('exp.loadError')} body={error} onRetry={load} /> : <Loading />}</Screen>
      </>
    );

  const active = data.members.filter((m) => !m.left_at);
  const bal = balances(
    data.expenses.map((e) => ({ payerId: e.payer_id, payers: e.payers, amountCents: e.amount_cents, shares: e.shares })),
    data.settlements.map((s) => ({ fromId: s.from_id, toId: s.to_id, amountCents: s.amount_cents })),
  );
  const money = (cents: number) => formatCents(cents, data.group.currency, locale);
  const hasDefault = !!data.group.default_shares;
  const parsedWeights = Object.fromEntries(active.map((m) => [m.user_id, Number((weights[m.user_id] ?? '').trim() || '0')]));
  const weightsOk = Object.values(parsedWeights).every((w) => Number.isFinite(w) && w >= 0) && Object.values(parsedWeights).some((w) => w > 0);
  const toHome = () => router.replace('/expenses');

  return (
    <>
      {header}
      <Screen>
        <SectionLabel>{t('exp.groupName')}</SectionLabel>
        <Field value={groupName} onChangeText={setGroupName} accessibilityLabel={t('exp.groupName')} maxLength={60} />
        <Button label={t('exp.saveName')} variant="secondary" disabled={!groupName.trim() || groupName.trim() === data.group.name} onPress={() => run(() => updateGroup(groupId, { name: groupName.trim() }))} style={styles.small} />

        <SectionLabel>{t('exp.yourName')}</SectionLabel>
        <Field value={myName} onChangeText={setMyName} accessibilityLabel={t('exp.yourName')} maxLength={60} />
        <Button label={t('exp.saveYourName')} variant="secondary" disabled={!myName.trim()} onPress={() => run(() => renameMe(groupId, myName))} style={styles.small} />

        <SectionLabel>{t('exp.simplify')}</SectionLabel>
        <Text style={[styles.hint, { color: c.ink60 }]}>{t('exp.simplifyHint')}</Text>
        <Chips
          options={[{ value: 'on', label: t('exp.on') }, { value: 'off', label: t('exp.off') }]}
          selected={[data.group.simplify_debts ? 'on' : 'off']}
          onToggle={(v) => run(() => updateGroup(groupId, { simplify_debts: v === 'on' }))}
          a11y={t('exp.simplify')}
        />

        <SectionLabel>{t('exp.defaultSplit')}</SectionLabel>
        <Text style={[styles.hint, { color: c.ink60 }]}>{t('exp.defaultSplitHint')}</Text>
        {active.map((m) => (
          <View key={m.user_id} style={styles.weightRow}>
            <Text style={[styles.weightName, { color: c.ink }]}>{m.display_name}</Text>
            <Field
              style={styles.weightField}
              value={weights[m.user_id] ?? ''}
              onChangeText={(v) => setWeights((w) => ({ ...w, [m.user_id]: v }))}
              accessibilityLabel={t('exp.weight.shares', { name: m.display_name })}
              placeholder="1"
              keyboardType="decimal-pad"
            />
          </View>
        ))}
        <Button label={t('exp.saveDefault')} variant="secondary" disabled={!weightsOk} onPress={() => run(() => updateGroup(groupId, { default_shares: parsedWeights }))} style={styles.small} />
        {hasDefault && <Button label={t('exp.clearDefault')} variant="tertiary" onPress={() => run(() => updateGroup(groupId, { default_shares: null }))} style={styles.small} />}

        <SectionLabel>{t('exp.people')}</SectionLabel>
        <Group>
          {active.map((m, i) => {
            const v = bal[m.user_id] ?? 0;
            const isMe = m.user_id === me;
            return (
              <Row
                key={m.user_id}
                first={i === 0}
                a11y={isMe ? undefined : t('exp.removeA11y', { name: m.display_name })}
                onPress={
                  isMe
                    ? undefined
                    : () => confirm(t('exp.removeTitle', { name: m.display_name }), v ? t('exp.removeNonZero') : undefined, t('exp.remove'), () => removeMember(groupId, m.user_id))
                }
              >
                <RowTitle>{isMe ? t('exp.you') : m.placeholder ? t('exp.notJoined', { name: m.display_name }) : m.display_name}</RowTitle>
                <RowMeta>{v === 0 ? t('exp.settledUp') : t(v > 0 ? 'exp.isOwed' : 'exp.owes', { amount: money(Math.abs(v)) })}</RowMeta>
              </Row>
            );
          })}
        </Group>
        <Text style={[styles.hint, { color: c.ink60 }]}>{t('exp.addPersonHint')}</Text>
        <Field value={newPerson} onChangeText={setNewPerson} accessibilityLabel={t('exp.newPerson')} placeholder={t('exp.newPerson')} maxLength={60} />
        <Button
          label={t('exp.addPerson')}
          variant="secondary"
          disabled={!newPerson.trim()}
          busy={busy}
          onPress={() => run(async () => {
            await addPlaceholder(groupId, newPerson.trim());
            setNewPerson('');
          })}
          style={styles.small}
        />

        <SectionLabel>{t('exp.invite')}</SectionLabel>
        <Text selectable style={[styles.code, { color: c.ink }]} accessibilityLabel={t('exp.inviteA11y', { code: data.group.invite_code.split('').join(' ') })}>
          {data.group.invite_code}
        </Text>
        <Button label={t('exp.newInvite')} variant="secondary" onPress={() => confirm(t('exp.newInviteTitle'), t('exp.newInviteBody'), t('exp.newInvite'), () => resetInvite(groupId))} />

        <Button
          label={t('exp.leave')}
          variant="danger"
          style={styles.button}
          onPress={() => confirm(t('exp.leaveTitle'), (bal[me ?? ''] ?? 0) ? t('exp.removeNonZero') : undefined, t('exp.leave'), () => removeMember(groupId), toHome)}
        />
        {data.group.created_by === me && (
          <Button
            label={t('exp.deleteGroup')}
            variant="danger"
            style={styles.small}
            onPress={() => confirm(t('exp.deleteGroupTitle', { name: data.group.name }), t('exp.deleteGroupBody'), t('exp.delete'), () => deleteGroup(groupId), toHome)}
          />
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 14, lineHeight: 20, marginHorizontal: 4, marginBottom: 8 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  weightName: { flex: 1, fontSize: 16 },
  weightField: { width: 120 },
  code: { fontSize: 28, letterSpacing: 4, fontWeight: '600', marginHorizontal: 4, marginBottom: 12 },
  button: { marginTop: 32 },
  small: { marginTop: 10 },
});
