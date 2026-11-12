import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { getInspection, listInspectionItems, listRooms, setDepositSplit } from '@/db/repo';
import type { SQLiteDatabase } from 'expo-sqlite';
import { parseCents } from '@/expenses/split';
import { useT } from '@/i18n/context';
import { formatMoney, parseDepositSplit, type DepositSplit } from '@/lib/depositSplit';
import { buildComparison } from '@/report/comparison';
import type { ReportData } from '@/report/types';
import { useTheme } from '@/theme';

type Changed = { id: number; name: string; room: string }; // id: the move-out item
type TenantDraft = { id: number; name: string; percent: string };
type DeductionDraft = { amount: string; to: number | null };

/** Rooms and items only (no photos): enough for buildComparison to flag worsened items. */
async function bare(db: SQLiteDatabase, id: number): Promise<ReportData> {
  const [inspection, rooms, items] = await Promise.all([getInspection(db, id), listRooms(db, id), listInspectionItems(db, id)]);
  if (!inspection) throw new Error('Inspection not found.');
  return {
    inspection,
    rooms: rooms.map((room) => ({ room, items: items.filter((i) => i.room_id === room.id).map((item) => ({ item, photos: [] })) })),
    thumbnails: {},
    acknowledgement: null,
    generatedAt: 0,
    receipts: {},
    verificationCode: null,
  };
}

// Accept a comma decimal ("12,50", "33,5") as typed on Spanish keyboards; "1,500" stays a thousands separator.
const decimal = (s: string) => s.trim().replace(/^(\d+),(\d{1,2})$/, '$1.$2');
const centsText = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toFixed(2));

// Settlement data, not evidence: editable on the finished move-out, saved as one JSON value.
export default function DepositSplitScreen() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [changed, setChanged] = useState<Changed[] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [deposit, setDeposit] = useState('');
  const [tenants, setTenants] = useState<TenantDraft[]>([]);
  const [deductions, setDeductions] = useState<Record<number, DeductionDraft>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const moveOut = await bare(db, inspectionId);
      const moveInId = moveOut.inspection.linked_move_in_id;
      if (moveOut.inspection.kind !== 'move_out' || moveInId == null) return setRefusal(t('split.notLinked'));
      const cmp = buildComparison(await bare(db, moveInId), moveOut);
      const split = parseDepositSplit(moveOut.inspection.deposit_split);
      setCurrency(moveOut.inspection.currency);
      setDeposit(centsText(split.depositCents));
      setTenants(
        split.tenants.length
          ? split.tenants.map((x) => ({ id: x.id, name: x.name, percent: x.percent == null ? '' : String(x.percent) }))
          : moveOut.inspection.tenant_name
            ? [{ id: 1, name: moveOut.inspection.tenant_name, percent: '' }]
            : [],
      );
      setDeductions(Object.fromEntries(Object.entries(split.deductions).map(([k, d]) => [k, { amount: centsText(d.cents), to: d.to }])));
      setChanged(cmp.rooms.flatMap((r) => r.items.flatMap((i) => (i.worsened && i.moveOut ? [{ id: i.moveOut.item.id, name: i.name, room: r.name }] : []))));
    })().catch((e: unknown) => setRefusal(errorMessage(e)));
  }, [inspectionId, t]);

  const editTenant = (id: number, patch: Partial<TenantDraft>) => setTenants((ts) => ts.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  // Also unassigns their deductions, so a person added later (who may reuse the id) does not inherit them.
  const removeTenant = (id: number) => {
    setTenants((ts) => ts.filter((y) => y.id !== id));
    setDeductions((ds) => Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, d.to === id ? { ...d, to: null } : d])));
  };
  const editDeduction = (id: number, patch: Partial<DeductionDraft>) =>
    setDeductions((ds) => ({ ...ds, [id]: { ...(ds[id] ?? { amount: '', to: null }), ...patch } }));
  const percents = tenants.filter((x) => x.name.trim()).map((x) => decimal(x.percent)).filter(Boolean).map(Number);
  const percentSum = percents.reduce((a, p) => a + p, 0);
  const percentOff = percents.length > 0 && Math.abs(percentSum - 100) > 1e-9;

  const save = async () => {
    const bad = (field: string) => Alert.alert(t('split.checkAmount'), t('split.checkAmountBody', { field }));
    const depositCents = deposit.trim() ? parseCents(decimal(deposit)) : null;
    if (deposit.trim() && depositCents == null) return bad(t('split.deposit'));
    const kept = tenants.filter((x) => x.name.trim());
    for (const x of kept) {
      const p = decimal(x.percent);
      if (p && !(Number(p) >= 0)) return bad(x.name);
    }
    if (percentOff) return Alert.alert(t('split.percentTitle'), t('split.percentOff', { total: String(percentSum) }));
    const ids = new Set(kept.map((x) => x.id));
    const out: DepositSplit = {
      depositCents,
      tenants: kept.map((x) => ({ id: x.id, name: x.name.trim(), percent: x.percent.trim() ? Number(decimal(x.percent)) : null })),
      deductions: {},
    };
    for (const item of changed ?? []) {
      const d = deductions[item.id];
      if (!d?.amount.trim()) continue;
      const cents = parseCents(decimal(d.amount));
      if (cents == null) return bad(item.name);
      out.deductions[item.id] = { cents, to: d.to != null && ids.has(d.to) ? d.to : null };
    }
    setSaving(true);
    try {
      await setDepositSplit(await getDb(), inspectionId, JSON.stringify(out));
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert(t('split.saveError'), errorMessage(e));
    }
  };

  const header = <Stack.Screen options={{ title: t('split.title') }} />;
  if (refusal || changed == null)
    return (
      <>
        {header}
        <Screen>{refusal ? <Problem title={t('split.loadError')} body={refusal} /> : <Loading />}</Screen>
      </>
    );

  const assignees = [
    { value: 'all', label: t('split.everyone') },
    ...tenants.filter((x) => x.name.trim()).map((x) => ({ value: String(x.id), label: x.name.trim() })),
  ];
  return (
    <>
      {header}
      <Screen floating={<Button label={t('common.save')} onPress={save} busy={saving} />}>
        <Text style={[styles.intro, { color: c.ink60 }]}>{t('split.intro')}</Text>
        <SectionLabel>{t('split.deposit')}</SectionLabel>
        <Field value={deposit} onChangeText={setDeposit} keyboardType="decimal-pad" placeholder={formatMoney(0, currency, locale)} accessibilityLabel={t('split.deposit')} />
        <SectionLabel>{t('split.tenants')}</SectionLabel>
        {tenants.map((x, i) => (
          <View key={x.id} style={styles.tenant}>
            <Field style={styles.name} value={x.name} onChangeText={(name) => editTenant(x.id, { name })} placeholder={t('split.tenantName', { n: i + 1 })} accessibilityLabel={t('split.tenantName', { n: i + 1 })} />
            <Field style={styles.percent} value={x.percent} onChangeText={(percent) => editTenant(x.id, { percent })} keyboardType="decimal-pad" placeholder={t('split.equal')} accessibilityLabel={t('split.percentA11y', { n: i + 1 })} />
            <Button label="−" a11y={t('split.removeTenant', { n: i + 1 })} variant="tertiary" onPress={() => removeTenant(x.id)} />
          </View>
        ))}
        {percentOff && <Text style={[styles.warn, { color: c.damaged }]}>{t('split.percentOff', { total: String(percentSum) })}</Text>}
        <Button
          label={t('split.addTenant')}
          variant="secondary"
          onPress={() => setTenants((ts) => [...ts, { id: Math.max(0, ...ts.map((x) => x.id)) + 1, name: '', percent: '' }])}
          style={styles.add}
        />
        <SectionLabel>{t('split.changed')}</SectionLabel>
        {changed.length === 0 && <Text style={[styles.intro, { color: c.ink60 }]}>{t('split.noChanged')}</Text>}
        {changed.map((item) => {
          const d = deductions[item.id];
          return (
            <View key={item.id} style={styles.item}>
              <Text style={[styles.itemName, { color: c.ink }]}>{`${item.room} · ${item.name}`}</Text>
              <Field value={d?.amount ?? ''} onChangeText={(amount) => editDeduction(item.id, { amount })} keyboardType="decimal-pad" placeholder={t('split.deduction')} accessibilityLabel={t('split.deductionA11y', { name: item.name })} />
              <Chips
                options={assignees}
                selected={[d?.to != null && assignees.some((a) => a.value === String(d.to)) ? String(d.to) : 'all']}
                onToggle={(v) => editDeduction(item.id, { to: v === 'all' ? null : Number(v) })}
                a11y={t('split.chargedTo')}
              />
            </View>
          );
        })}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 15, marginHorizontal: 4, marginBottom: 8 },
  tenant: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  name: { flex: 1 },
  percent: { width: 110 },
  warn: { fontSize: 15, marginHorizontal: 4, marginBottom: 8 },
  add: { marginTop: 4 },
  item: { gap: 8, marginBottom: 16 },
  itemName: { fontSize: 17, fontWeight: '600', marginHorizontal: 4 },
});
