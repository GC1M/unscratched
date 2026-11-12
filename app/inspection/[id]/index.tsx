import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ConditionMark } from '@/components/ConditionMark';
import { FinishedBanner } from '@/components/FinishedBanner';
import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { InlineInput } from '@/components/InlineInput';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import {
  addRoom,
  copyFromMoveIn,
  deleteInspection,
  deleteRoom,
  finishInspection,
  getInspection,
  listInspectionItems,
  listRooms,
  moveRoom,
  renameRoom,
  setLandlordContact,
} from '@/db/repo';
import type { Inspection, Room } from '@/db/types';
import { depositDueDate, depositSummary, lookupDepositDeadline } from '@/legal/depositDeadlines';
import { useT } from '@/i18n/context';
import { formatMoney, parseDepositSplit } from '@/lib/depositSplit';
import { shortDate } from '@/lib/format';
import { nextRoom } from '@/lib/next';
import { validatePortalUrl } from '@/lib/portalUrl';
import { cancelReminders } from '@/lib/scheduleReminders';
import { progress, type Progress } from '@/lib/progress';
import { acknowledgeLink, fetchAcknowledgements, receiptedManifest, type Acknowledgement } from '@/receipts/acknowledgements';
import { verificationCode } from '@/receipts/manifest';
import { syncReceipts } from '@/receipts/queue';
import { exportComparison, exportDisputeLetter } from '@/report/exportComparison';
import { useTheme } from '@/theme';

const CONTACT_FIELDS = [
  ['landlord_email', 'rooms.landlordEmail', 'name@example.com'],
  ['portal_url', 'rooms.landlordPortal', 'https://'],
] as const;
type ContactField = (typeof CONTACT_FIELDS)[number][0];

type RoomRow = Room & { done: number; total: number; fair: number; damaged: number };

export default function RoomList() {
  const { c } = useTheme();
  const { t, lang, locale } = useT();
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  // undefined while loading, null when it no longer exists.
  const [inspection, setInspection] = useState<Inspection | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [summary, setSummary] = useState<Progress | null>(null);
  const [next, setNext] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [contact, setContact] = useState<{ field: ContactField; value: string } | null>(null);
  const [comparing, setComparing] = useState(false);
  const [lettering, setLettering] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Set once the server has a receipt for this finished inspection's manifest; acks come from the server, best effort.
  const [manifest, setManifest] = useState<string | null>(null);
  const [acks, setAcks] = useState<Acknowledgement[]>([]);

  const load = useCallback(async () => {
    setError(null);
    let found, list, items;
    try {
      const db = await getDb();
      [found, list, items] = await Promise.all([
        getInspection(db, inspectionId),
        listRooms(db, inspectionId),
        listInspectionItems(db, inspectionId),
      ]);
    } catch (e) {
      setError(e);
      return;
    }
    setInspection(found);
    if (found?.finished_at != null) {
      void receiptedManifest(await getDb(), inspectionId)
        .then(async (m) => {
          setManifest(m);
          if (m) setAcks(await fetchAcknowledgements(m));
        })
        .catch(() => {}); // the ack section just stays hidden
    }
    setSummary(progress(list, items));
    setNext(nextRoom(list, items));
    setRooms(
      list.map((room) => {
        const own = items.filter((i) => i.room_id === room.id);
        return {
          ...room,
          done: own.filter((i) => i.condition != null).length,
          total: own.length,
          fair: own.filter((i) => i.condition === 'fair').length,
          damaged: own.filter((i) => i.condition === 'damaged').length,
        };
      }),
    );
  }, [inspectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (action: (db: Awaited<ReturnType<typeof getDb>>) => Promise<unknown>) => {
    try {
      await action(await getDb());
    } catch (e) {
      Alert.alert(t('common.somethingWrong'), errorMessage(e));
    }
    await load();
  };

  const add = async () => {
    const name = adding?.trim();
    setAdding(null);
    if (name) await run((db) => addRoom(db, inspectionId, name));
  };

  const saveRename = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    setRenaming(null);
    if (name) await run((db) => renameRoom(db, renaming.id, name));
  };

  // Delivery details, not evidence: editable after finish too.
  const saveContact = async () => {
    if (!contact || !inspection) return;
    const value = contact.value.trim() || null;
    if (contact.field === 'portal_url' && value && !validatePortalUrl(value)) {
      return Alert.alert(t('rooms.checkPortal'), t('rooms.checkPortalBody'));
    }
    setContact(null);
    const { landlord_email, portal_url } = inspection;
    await run((db) => setLandlordContact(db, inspectionId, { landlord_email, portal_url, [contact.field]: value }));
  };

  const confirmDelete = (room: Room) =>
    Alert.alert(t('rooms.deleteRoom'), t('rooms.deleteRoomBody', { name: room.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => run((db) => deleteRoom(db, room.id)) },
    ]);

  // ponytail: system alert instead of a custom form sheet; swap for presentation: 'formSheet' if the sheet matters.
  const confirmFinish = () =>
    Alert.alert(
      t('rooms.finishTitle'),
      t('rooms.finishBody'),
      [
        { text: t('common.notYet'), style: 'cancel' },
        {
          text: t('rooms.finishAndLock'),
          onPress: () =>
            run(async (db) => {
              await finishInspection(db, inspectionId);
              void syncReceipts(db); // fire and forget: offline just leaves the receipts pending
            }),
        },
      ],
    );

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteInspection(await getDb(), inspectionId);
      void cancelReminders(inspectionId).catch(() => {}); // the inspection is gone either way
      router.back();
    } catch (e) {
      setDeleting(false);
      Alert.alert(t('rooms.deleteError'), errorMessage(e));
    }
  };

  // Finished inspections can be deleted too: the lock stops swapping evidence, not discarding all of it.
  const confirmDeleteInspection = () =>
    Alert.alert(
      t('rooms.deleteInspectionTitle'),
      `${t('rooms.deleteInspectionBody')}${inspection?.kind === 'move_in' ? t('rooms.deleteInspectionMoveIn') : ''}`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: remove },
      ],
    );

  const shareComparison = async () => {
    if (comparing) return;
    setComparing(true);
    try {
      await exportComparison(await getDb(), inspectionId, lang);
    } catch (e) {
      Alert.alert(t('rooms.comparisonFailed'), errorMessage(e));
    } finally {
      setComparing(false);
    }
  };

  const shareLetter = async () => {
    if (lettering) return;
    setLettering(true);
    try {
      await exportDisputeLetter(await getDb(), inspectionId, lang);
    } catch (e) {
      Alert.alert(t('rooms.letterFailed'), errorMessage(e));
    } finally {
      setLettering(false);
    }
  };

  const askLandlord = () => {
    if (!manifest) return;
    void Share.share({
      message: t('rooms.ackMessage', { code: verificationCode(manifest), link: acknowledgeLink(manifest) }),
    }).catch((e: unknown) => Alert.alert(t('rooms.shareError'), errorMessage(e)));
  };

  const startMoveOut = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const id = await copyFromMoveIn(await getDb(), inspectionId);
      router.push(`/inspection/${id}`);
    } catch (e) {
      Alert.alert(t('rooms.moveOutError'), errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const locked = inspection?.finished_at != null;
  const comparable = inspection?.kind === 'move_out' && inspection.linked_move_in_id != null;
  const allDone = !!summary && summary.itemsTotal > 0 && summary.roomsDone === summary.roomsTotal;
  const roomsLeft = summary ? summary.roomsTotal - summary.roomsDone : 0;
  const deposit = inspection?.kind === 'move_out' && inspection.state ? lookupDepositDeadline(inspection.state) : undefined;
  const split = parseDepositSplit(inspection?.deposit_split ?? null);
  const splitMeta =
    split.depositCents != null
      ? t('rooms.depositSplitMeta', { amount: formatMoney(split.depositCents, locale), n: split.tenants.length })
      : t('rooms.notSet');

  if (error || inspection === null)
    return (
      <Screen>
        {error ? (
          <Problem title={t('rooms.loadError')} body={errorMessage(error)} onRetry={load} />
        ) : (
          <Problem title={t('common.inspectionNotFound')} body={t('common.mayBeDeleted')} />
        )}
      </Screen>
    );
  if (inspection === undefined)
    return (
      <Screen>
        <Loading />
      </Screen>
    );

  return (
    <>
      <Stack.Screen options={{ title: inspection.address }}>
        {!locked && (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button accessibilityLabel={t(editing ? 'common.doneEditing' : 'rooms.editRooms')} onPress={() => setEditing((e) => !e)}>
              {t(editing ? 'common.done' : 'common.edit')}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        )}
      </Stack.Screen>
      <Screen
        floating={
          editing ? null : locked ? (
            <View style={styles.stack}>
              <Button label={t('common.exportReport')} onPress={() => router.push(`/inspection/${inspectionId}/export`)} />
              {comparable && (
                <Button label={t(comparing ? 'rooms.buildingComparison' : 'rooms.exportComparison')} a11y={t('rooms.exportComparison')} variant="secondary" onPress={shareComparison} busy={comparing} />
              )}
              {comparable && (
                <Button label={t(lettering ? 'rooms.buildingLetter' : 'rooms.disputeLetter')} a11y={t('rooms.disputeLetter')} variant="secondary" onPress={shareLetter} busy={lettering} />
              )}
              {inspection?.kind === 'move_in' && (
                <Button label={t('rooms.startMoveOut')} variant="secondary" onPress={startMoveOut} busy={starting} />
              )}
            </View>
          ) : allDone ? (
            <Button label={t('rooms.finish')} onPress={confirmFinish} />
          ) : next ? (
            <Button
              label={t('common.continueWith', { name: next.name })}
              trailing={t(roomsLeft === 1 ? 'rooms.roomsLeft.one' : 'rooms.roomsLeft.other', { n: roomsLeft })}
              onPress={() => router.push(`/inspection/${inspectionId}/room/${next.id}`)}
            />
          ) : null
        }
      >
        {inspection && (
          <Text style={[styles.subtitle, { color: c.ink60 }]}>
            {t('common.kindStarted', { kind: t(`kind.${inspection.kind}`), date: shortDate(inspection.started_at, locale) })}
          </Text>
        )}
        {locked && inspection?.finished_at != null && <FinishedBanner finishedAt={inspection.finished_at} />}
        {inspection.sent_at != null && inspection.sent_channel && (
          <Text style={[styles.sent, { color: c.ink }]}>
            {t('rooms.sent', { date: shortDate(inspection.sent_at, locale), channel: t(`channel.${inspection.sent_channel}`) })}
          </Text>
        )}
        {locked && manifest && (
          <View style={styles.ack}>
            {acks.map((a) => (
              <Text key={`${a.at}-${a.name}`} style={[styles.ackText, { color: c.ink }]}>
                {t('rooms.acknowledged', { name: a.name, date: shortDate(a.at, locale) })}
              </Text>
            ))}
            <Button label={t('rooms.askAck')} variant="secondary" onPress={askLandlord} />
          </View>
        )}
        {summary && (
          <View style={styles.progress}>
            <ProgressBar done={summary.itemsDone} total={summary.itemsTotal} note={t('common.ofRooms', { done: summary.roomsDone, total: summary.roomsTotal })} />
          </View>
        )}
        {deposit && (
          <View style={styles.deposit} testID="deposit-deadline">
            <Text style={[styles.depositText, { color: c.ink60 }]}>{depositSummary(deposit)}</Text>
            {deposit.days != null && inspection.move_out_date != null && (
              <Text style={[styles.depositText, { color: c.ink }]}>
                {t('deposit.dueAround', { date: new Date(depositDueDate(inspection.move_out_date, deposit.days)).toLocaleDateString(locale) })}
              </Text>
            )}
            <Text style={[styles.depositText, { color: c.ink60 }]}>
              <Text accessibilityRole="link" style={styles.link} onPress={() => Linking.openURL(deposit.source)}>{t('deposit.source')}</Text>. {t('common.notLegalAdvice')}.
            </Text>
          </View>
        )}
        <Group>
          {rooms.map((room, idx) =>
            renaming?.id === room.id ? (
              <InlineInput
                key={room.id}
                value={renaming.name}
                onChangeText={(name) => setRenaming({ id: room.id, name })}
                onSubmit={saveRename}
                onCancel={() => setRenaming(null)}
                a11y={t('rooms.roomName')}
              />
            ) : (
              <Row
                key={room.id}
                first={idx === 0}
                onPress={editing ? () => setRenaming({ id: room.id, name: room.name }) : () => router.push(`/inspection/${inspectionId}/room/${room.id}`)}
                a11y={
                  editing
                    ? t('rooms.rename', { name: room.name })
                    : `${t('rooms.open', { name: room.name, done: room.done, total: room.total })}${room.fair ? t('rooms.fairCount', { n: room.fair }) : ''}${room.damaged ? t('rooms.damagedCount', { n: room.damaged }) : ''}`
                }
                controlsBefore={
                  editing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('rooms.deleteNamed', { name: room.name })}
                      onPress={() => confirmDelete(room)}
                      hitSlop={10}
                      style={[styles.minus, { backgroundColor: c.damaged }]}
                    >
                      <Text maxFontSizeMultiplier={1} style={[styles.minusText, { color: c.onInk }]}>−</Text>
                    </Pressable>
                  ) : undefined
                }
                controlsAfter={
                  editing ? (
                    <View style={styles.reorder}>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('rooms.moveUp', { name: room.name })} hitSlop={8} onPress={() => run((db) => moveRoom(db, room.id, 'up'))} style={styles.arrow}>
                        <Text maxFontSizeMultiplier={1} style={[styles.arrowText, { color: c.ink60 }]}>↑</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={t('rooms.moveDown', { name: room.name })} hitSlop={8} onPress={() => run((db) => moveRoom(db, room.id, 'down'))} style={styles.arrow}>
                        <Text maxFontSizeMultiplier={1} style={[styles.arrowText, { color: c.ink60 }]}>↓</Text>
                      </Pressable>
                    </View>
                  ) : undefined
                }
                trailing={
                  editing ? (
                    <View />
                  ) : (
                    <View style={styles.right}>
                      {room.fair > 0 && (
                        <View style={styles.tally}>
                          <ConditionMark condition="fair" size={10} />
                          <Text style={[styles.tallyText, { color: c.fairInk }]}>{room.fair}</Text>
                        </View>
                      )}
                      {room.damaged > 0 && (
                        <View style={styles.tally}>
                          <ConditionMark condition="damaged" size={10} />
                          <Text style={[styles.tallyText, { color: c.damaged }]}>{room.damaged}</Text>
                        </View>
                      )}
                      <Text style={[styles.count, { color: c.ink60 }]}>
                        {t('common.of', { done: room.done, total: room.total })}
                      </Text>
                      <View style={[styles.chevron, { borderColor: c.ink30 }]} />
                    </View>
                  )
                }
              >
                <RowTitle>{room.name}</RowTitle>
              </Row>
            ),
          )}
          {!locked &&
            (adding != null ? (
              <InlineInput value={adding} onChangeText={setAdding} onSubmit={add} onCancel={() => setAdding(null)} placeholder={t('rooms.roomName')} a11y={t('rooms.newRoomName')} submitLabel={t('common.add')} />
            ) : (
              <Row first={rooms.length === 0} onPress={() => setAdding('')} a11y={t('rooms.addRoom')} trailing={<View />} leading={<View style={[styles.plus, { borderColor: c.ink30 }]}><Text maxFontSizeMultiplier={1} style={[styles.plusText, { color: c.ink60 }]}>+</Text></View>}>
                <Text style={[styles.addText, { color: c.ink60 }]}>{t('rooms.addRoom')}</Text>
              </Row>
            ))}
        </Group>
        <SectionLabel>{t('rooms.contact')}</SectionLabel>
        <Group>
          {CONTACT_FIELDS.map(([field, label, placeholder], idx) =>
            contact?.field === field ? (
              <InlineInput
                key={field}
                value={contact.value}
                onChangeText={(value) => setContact({ field, value })}
                onSubmit={saveContact}
                onCancel={() => setContact(null)}
                placeholder={placeholder}
                a11y={t(label)}
              />
            ) : (
              <Row key={field} first={idx === 0} onPress={() => setContact({ field, value: inspection[field] ?? '' })} a11y={t('rooms.editContact', { label: t(label) })}>
                <RowTitle>{t(label)}</RowTitle>
                <RowMeta>{inspection[field] ?? t('rooms.notSet')}</RowMeta>
              </Row>
            ),
          )}
        </Group>
        {locked && comparable && (
          <>
            <SectionLabel>{t('split.title')}</SectionLabel>
            <Group>
              <Row first onPress={() => router.push(`/inspection/${inspectionId}/deposit`)} a11y={`${t('rooms.depositSplit')}, ${splitMeta}`}>
                <RowTitle>{t('rooms.depositSplit')}</RowTitle>
                <RowMeta>{splitMeta}</RowMeta>
              </Row>
            </Group>
          </>
        )}
        <Button
          label={t(deleting ? 'rooms.deleting' : 'rooms.deleteInspection')}
          a11y={t('rooms.deleteInspection')}
          testID="delete-inspection"
          variant="danger"
          onPress={confirmDeleteInspection}
          busy={deleting}
          style={styles.delete}
        />
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 15, marginTop: -4, marginBottom: 12, marginLeft: 4 },
  stack: { gap: 8 },
  deposit: { gap: 4, marginBottom: 16, marginHorizontal: 4 },
  depositText: { fontSize: 15 },
  link: { textDecorationLine: 'underline' },
  delete: { marginTop: 32 },
  ack: { gap: 8, marginBottom: 16 },
  ackText: { fontSize: 15, marginHorizontal: 4 },
  sent: { fontSize: 15, marginHorizontal: 4, marginBottom: 12 },
  progress: { marginBottom: 16, marginHorizontal: 4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tally: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  tallyText: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  count: { fontSize: 15, fontVariant: ['tabular-nums'] },
  chevron: { width: 8, height: 8, borderRightWidth: 1.5, borderTopWidth: 1.5, transform: [{ rotate: '45deg' }] },
  reorder: { flexDirection: 'row', gap: 4 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 18 },
  minus: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  minusText: { fontSize: 18, lineHeight: 20, fontWeight: '600' },
  plus: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 16, lineHeight: 18 },
  addText: { fontSize: 17 },
});
