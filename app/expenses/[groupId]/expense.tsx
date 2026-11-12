import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Chips } from '@/components/Chips';
import { Field } from '@/components/Field';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { currentUserId, deleteExpense, loadGroup, receiptUrl, saveExpense, saveRecurring, uploadReceipt } from '@/expenses/api';
import { formatCents, parseCents, splitAmount, splitItemized } from '@/expenses/split';
import { CATEGORIES, type Category, type Every, type GroupData, type SplitModeDb } from '@/expenses/types';
import { useT } from '@/i18n/context';
import { useTheme } from '@/theme';

type Item = { name: string; amount: string; members: string[] };
const MODES: SplitModeDb[] = ['equal', 'exact', 'percent', 'shares', 'itemized'];
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD in local time
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Add or edit an expense: amount, payer, category, date, any split mode, receipt photo, and repeat. */
export default function ExpenseEditor() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const { groupId, id } = useLocalSearchParams<{ groupId: string; id?: string }>();
  const [data, setData] = useState<GroupData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>('general');
  const [spentOn, setSpentOn] = useState(today());
  const [payer, setPayer] = useState('');
  const [mode, setMode] = useState<SplitModeDb>('equal');
  const [included, setIncluded] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [items, setItems] = useState<Item[]>([{ name: '', amount: '', members: [] }]);
  const [extras, setExtras] = useState('');
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null); // local or signed URL shown in the form
  const [newPhoto, setNewPhoto] = useState<string | null>(null); // local file not uploaded yet
  const [repeat, setRepeat] = useState<'none' | Every>('none');
  const [camera, setCamera] = useState(false);
  const [saving, setSaving] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    (async () => {
      const [d, me] = await Promise.all([loadGroup(groupId), currentUserId()]);
      const ids = d.members.map((m) => m.user_id);
      setData(d);
      setIncluded(ids);
      setPayer(me && ids.includes(me) ? me : ids[0]);
      setItems([{ name: '', amount: '', members: ids }]);
      const e = id ? d.expenses.find((x) => x.id === id) : undefined;
      if (id && !e) return setLoadError(t('exp.notFound'));
      if (!e) return;
      setDescription(e.description);
      setAmount((e.amount_cents / 100).toFixed(2));
      setCategory(e.category);
      setSpentOn(e.spent_on);
      setPayer(e.payer_id);
      setReceiptPath(e.receipt_path);
      if (e.receipt_path) receiptUrl(e.receipt_path).then(setPhoto, () => {});
      if (e.split_mode === 'itemized' && e.items?.length) {
        setMode('itemized');
        setItems(e.items.map((it) => ({ name: it.name, amount: (it.cents / 100).toFixed(2), members: it.members })));
        const extraCents = e.amount_cents - e.items.reduce((s, it) => s + it.cents, 0);
        setExtras(extraCents ? (extraCents / 100).toFixed(2) : '');
      } else if (e.split_mode === 'equal') {
        setIncluded(ids.filter((m) => (e.shares[m] ?? 0) > 0));
      } else {
        // Percent and share weights are not stored, only the cents they produced, so edit them as exact amounts.
        setMode('exact');
        setWeights(Object.fromEntries(ids.map((m) => [m, ((e.shares[m] ?? 0) / 100).toFixed(2)])));
      }
    })().catch((e: unknown) => setLoadError(errorMessage(e)));
  }, [groupId, id, t]);

  const ids = data?.members.map((m) => m.user_id) ?? [];

  // Total and shares from the form, or the reason they can't be computed yet.
  const computed = ((): { total: number; shares: Record<string, number> } | { error: string } => {
    try {
      if (mode === 'itemized') {
        const lines = items.map((it) => ({ cents: parseCents(it.amount), members: it.members }));
        if (lines.some((l) => l.cents == null || !l.members.length)) return { error: t('exp.itemIncomplete') };
        const extra = extras.trim() ? parseCents(extras) : 0;
        if (extra == null) return { error: t('exp.badAmount') };
        const shares = splitItemized(lines as { cents: number; members: string[] }[], extra, ids);
        return { total: Object.values(shares).reduce((a, b) => a + b, 0), shares };
      }
      const total = parseCents(amount);
      if (!total) return { error: t('exp.badAmount') };
      if (mode === 'equal') {
        if (!included.length) return { error: t('exp.pickSomeone') };
        return { total, shares: splitAmount(total, included, 'equal') };
      }
      const parsed: Record<string, number> = {};
      for (const m of ids) {
        const raw = (weights[m] ?? '').trim();
        const v = !raw ? 0 : mode === 'exact' ? parseCents(raw) : Number(raw);
        if (v == null || !Number.isFinite(v) || v < 0) return { error: t('exp.badAmount') };
        parsed[m] = v;
      }
      return { total, shares: splitAmount(total, ids, mode, parsed) };
    } catch {
      const total = parseCents(amount) ?? 0;
      if (mode === 'exact') {
        const sum = ids.reduce((s, m) => s + (parseCents(weights[m] ?? '') ?? 0), 0);
        return { error: t('exp.exactOff', { left: formatCents(total - sum, data?.group.currency ?? 'USD', locale) }) };
      }
      return { error: t(mode === 'percent' ? 'exp.percentOff' : 'exp.sharesOff') };
    }
  })();

  const takePhoto = async () => {
    const shot = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
    if (shot) {
      setPhoto(shot.uri);
      setNewPhoto(shot.uri);
    }
    setCamera(false);
  };

  const save = async () => {
    if (!data || saving || 'error' in computed) return;
    if (!description.trim()) return Alert.alert(t('exp.needDescription'));
    if (!DATE.test(spentOn) || Number.isNaN(Date.parse(spentOn))) return Alert.alert(t('exp.badDate'));
    setSaving(true);
    try {
      const base = {
        groupId, description: description.trim(), amountCents: computed.total, payerId: payer, category, splitMode: mode,
        shares: computed.shares,
      };
      if (repeat !== 'none' && !id) {
        // The first occurrence is added by the server on the next load, so it is not also saved here.
        await saveRecurring({ ...base, every: repeat, nextOn: spentOn });
      } else {
        const path = newPhoto ? await uploadReceipt(groupId, newPhoto) : receiptPath;
        const lines = mode === 'itemized' ? items.map((it) => ({ name: it.name.trim(), cents: parseCents(it.amount) ?? 0, members: it.members })) : null;
        await saveExpense({ ...base, id: id ?? null, spentOn, items: lines, receiptPath: path });
      }
      router.back();
    } catch (e) {
      Alert.alert(t('exp.failed'), errorMessage(e));
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(t('exp.deleteExpense'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('exp.delete'),
        style: 'destructive',
        onPress: () => deleteExpense(id!).then(() => router.back(), (e: unknown) => Alert.alert(t('exp.failed'), errorMessage(e))),
      },
    ]);

  const title = t(id ? 'exp.editExpense' : 'exp.addExpense');
  const header = <Stack.Screen options={{ title, headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />;
  if (loadError || !data)
    return (
      <>
        {header}
        <Screen>{loadError ? <Problem title={t('exp.loadError')} body={loadError} /> : <Loading />}</Screen>
      </>
    );

  if (camera) {
    return (
      <>
        {header}
        {permission?.granted ? (
          <View style={styles.camera}>
            <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
            <View style={styles.shutter}>
              <Button label={t('exp.takePhoto')} onPress={takePhoto} />
              <Button label={t('common.cancel')} variant="secondary" onPress={() => setCamera(false)} style={styles.small} />
            </View>
          </View>
        ) : (
          <Screen>
            <Problem title={t('exp.cameraTitle')} body={t('exp.cameraBody')} />
            <Button label={t('exp.allowCamera')} onPress={requestPermission} />
            <Button label={t('common.cancel')} variant="tertiary" onPress={() => setCamera(false)} style={styles.small} />
          </Screen>
        )}
      </>
    );
  }

  const people = data.members.map((m) => ({ value: m.user_id, label: m.display_name }));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setItem = (i: number, patch: Partial<Item>) => setItems((its) => its.map((it, j) => (j === i ? { ...it, ...patch } : it)));
  const money = (cents: number) => formatCents(cents, data.group.currency, locale);

  return (
    <>
      {header}
      <Screen>
        <SectionLabel>{t('exp.description')}</SectionLabel>
        <Field value={description} onChangeText={setDescription} accessibilityLabel={t('exp.description')} placeholder={t('exp.descriptionHint')} />
        {mode !== 'itemized' && (
          <>
            <SectionLabel>{t('exp.amount', { currency: data.group.currency })}</SectionLabel>
            <Field value={amount} onChangeText={setAmount} accessibilityLabel={t('exp.amount', { currency: data.group.currency })} keyboardType="decimal-pad" placeholder="0.00" />
          </>
        )}
        <SectionLabel>{t('exp.paidByLabel')}</SectionLabel>
        <Chips options={people} selected={[payer]} onToggle={setPayer} a11y={t('exp.paidByLabel')} />
        <SectionLabel>{t('exp.category')}</SectionLabel>
        <Chips options={CATEGORIES.map((v) => ({ value: v, label: t(`exp.cat.${v}`) }))} selected={[category]} onToggle={setCategory} a11y={t('exp.category')} />
        <SectionLabel>{t('exp.date')}</SectionLabel>
        <Field value={spentOn} onChangeText={setSpentOn} accessibilityLabel={t('exp.date')} placeholder="YYYY-MM-DD" autoCapitalize="none" />

        <SectionLabel>{t('exp.split')}</SectionLabel>
        <Chips options={MODES.map((v) => ({ value: v, label: t(`exp.mode.${v}`) }))} selected={[mode]} onToggle={setMode} a11y={t('exp.split')} />
        <View style={styles.split}>
          {mode === 'equal' && <Chips multi options={people} selected={included} onToggle={(v) => setIncluded((l) => toggle(l, v))} a11y={t('exp.splitBetween')} />}
          {(mode === 'exact' || mode === 'percent' || mode === 'shares') &&
            data.members.map((m) => (
              <View key={m.user_id} style={styles.weightRow}>
                <Text style={[styles.weightName, { color: c.ink }]}>{m.display_name}</Text>
                <Field
                  style={styles.weightField}
                  value={weights[m.user_id] ?? ''}
                  onChangeText={(v) => setWeights((w) => ({ ...w, [m.user_id]: v }))}
                  accessibilityLabel={t(`exp.weight.${mode}`, { name: m.display_name })}
                  placeholder={mode === 'exact' ? '0.00' : mode === 'percent' ? '%' : '1'}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
          {mode === 'itemized' && (
            <>
              {items.map((it, i) => (
                <View key={i} style={[styles.item, { borderColor: c.hair }]}>
                  <Field value={it.name} onChangeText={(name) => setItem(i, { name })} accessibilityLabel={t('exp.itemName', { n: i + 1 })} placeholder={t('exp.itemName', { n: i + 1 })} />
                  <Field value={it.amount} onChangeText={(v) => setItem(i, { amount: v })} accessibilityLabel={t('exp.itemAmount', { n: i + 1 })} placeholder="0.00" keyboardType="decimal-pad" style={styles.small} />
                  <View style={styles.small}>
                    <Chips multi options={people} selected={it.members} onToggle={(v) => setItem(i, { members: toggle(it.members, v) })} a11y={t('exp.itemFor', { n: i + 1 })} />
                  </View>
                  {items.length > 1 && (
                    <Button label={t('exp.removeItem')} a11y={t('exp.removeItemA11y', { n: i + 1 })} variant="tertiary" onPress={() => setItems((its) => its.filter((_, j) => j !== i))} />
                  )}
                </View>
              ))}
              <Button label={t('exp.addItem')} variant="secondary" onPress={() => setItems((its) => [...its, { name: '', amount: '', members: ids }])} />
              <SectionLabel>{t('exp.extras')}</SectionLabel>
              <Field value={extras} onChangeText={setExtras} accessibilityLabel={t('exp.extras')} placeholder="0.00" keyboardType="decimal-pad" />
            </>
          )}
        </View>
        <Text accessibilityLiveRegion="polite" style={[styles.summary, { color: 'error' in computed ? c.damaged : c.ink60 }]}>
          {'error' in computed
            ? computed.error
            : data.members
                .filter((m) => computed.shares[m.user_id])
                .map((m) => `${m.display_name} ${money(computed.shares[m.user_id])}`)
                .join(' · ') + (mode === 'itemized' ? ` · ${t('exp.total', { amount: money(computed.total) })}` : '')}
        </Text>

        {!id && mode !== 'itemized' && (
          <>
            <SectionLabel>{t('exp.repeat')}</SectionLabel>
            <Chips
              options={[{ value: 'none', label: t('exp.every.none') }, { value: 'weekly', label: t('exp.every.weekly') }, { value: 'monthly', label: t('exp.every.monthly') }]}
              selected={[repeat]}
              onToggle={(v) => setRepeat(v as 'none' | Every)}
              a11y={t('exp.repeat')}
            />
          </>
        )}

        {repeat === 'none' && (
          <>
            <SectionLabel>{t('exp.receipt')}</SectionLabel>
            {photo && <Image source={{ uri: photo }} style={styles.photo} resizeMode="cover" accessibilityLabel={t('exp.receipt')} />}
            <Button label={t(photo ? 'exp.retakeReceipt' : 'exp.addReceipt')} variant="secondary" onPress={() => setCamera(true)} />
          </>
        )}

        <Button label={t(saving ? 'exp.saving' : 'exp.save')} a11y={t('exp.save')} disabled={'error' in computed} busy={saving} onPress={save} style={styles.button} />
        {id && <Button label={t('exp.deleteExpense')} variant="danger" onPress={remove} style={styles.small} />}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  split: { marginTop: 12, gap: 8 },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  weightName: { flex: 1, fontSize: 16 },
  weightField: { width: 120 },
  item: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 12, marginBottom: 8 },
  summary: { fontSize: 14, marginTop: 10, marginHorizontal: 4 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 16, marginBottom: 10 },
  camera: { flex: 1, backgroundColor: '#000' },
  shutter: { position: 'absolute', left: 16, right: 16, bottom: 48 },
  button: { marginTop: 32 },
  small: { marginTop: 10 },
});
