import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ConditionMark } from '@/components/ConditionMark';
import { FinishedBanner } from '@/components/FinishedBanner';
import { Group, Row, RowTitle } from '@/components/Group';
import { InlineInput } from '@/components/InlineInput';
import { ProgressBar } from '@/components/ProgressBar';
import { Floating, Screen } from '@/components/Screen';
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
} from '@/db/repo';
import type { Inspection, Room } from '@/db/types';
import { kindLabel, shortDate } from '@/lib/format';
import { nextRoom } from '@/lib/next';
import { progress, type Progress } from '@/lib/progress';
import { syncReceipts } from '@/receipts/queue';
import { exportComparison } from '@/report/exportComparison';
import { useTheme } from '@/theme';

type RoomRow = Room & { done: number; total: number; fair: number; damaged: number };

export default function RoomList() {
  const { c } = useTheme();
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
  const [comparing, setComparing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
      Alert.alert('Something went wrong', errorMessage(e));
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

  const confirmDelete = (room: Room) =>
    Alert.alert('Delete room?', `"${room.name}" and all its items and photos will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run((db) => deleteRoom(db, room.id)) },
    ]);

  // ponytail: system alert instead of a custom form sheet; swap for presentation: 'formSheet' if the sheet matters.
  const confirmFinish = () =>
    Alert.alert(
      'Finish this inspection?',
      'Conditions, notes, rooms and photos lock so the report can be trusted. You can still export it any time.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Finish and lock',
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
      router.back();
    } catch (e) {
      setDeleting(false);
      Alert.alert('Could not delete inspection', errorMessage(e));
    }
  };

  // Finished inspections can be deleted too: the lock stops swapping evidence, not discarding all of it.
  const confirmDeleteInspection = () =>
    Alert.alert(
      'Delete this inspection?',
      `All rooms, notes and photos will be permanently removed from this phone. This cannot be undone.${
        inspection?.kind === 'move_in' ? ' A move-out started from it is kept, but can no longer be compared.' : ''
      }`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: remove },
      ],
    );

  const shareComparison = async () => {
    if (comparing) return;
    setComparing(true);
    try {
      await exportComparison(await getDb(), inspectionId);
    } catch (e) {
      Alert.alert('Comparison export failed', errorMessage(e));
    } finally {
      setComparing(false);
    }
  };

  const startMoveOut = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const id = await copyFromMoveIn(await getDb(), inspectionId);
      router.push(`/inspection/${id}`);
    } catch (e) {
      Alert.alert('Could not start move-out', errorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const locked = inspection?.finished_at != null;
  const comparable = inspection?.kind === 'move_out' && inspection.linked_move_in_id != null;
  const allDone = !!summary && summary.itemsTotal > 0 && summary.roomsDone === summary.roomsTotal;
  const roomsLeft = summary ? summary.roomsTotal - summary.roomsDone : 0;

  if (error || inspection === null)
    return (
      <Screen>
        {error ? (
          <Problem title="Could not load this inspection" body={errorMessage(error)} onRetry={load} />
        ) : (
          <Problem title="Inspection not found" body="It may have been deleted." />
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
            <Stack.Toolbar.Button accessibilityLabel={editing ? 'Done editing' : 'Edit rooms'} onPress={() => setEditing((e) => !e)}>
              {editing ? 'Done' : 'Edit'}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        )}
      </Stack.Screen>
      <Screen>
        {inspection && (
          <Text style={[styles.subtitle, { color: c.ink60 }]}>
            {kindLabel(inspection.kind)}, started {shortDate(inspection.started_at)}
          </Text>
        )}
        {locked && inspection?.finished_at != null && <FinishedBanner finishedAt={inspection.finished_at} />}
        {summary && (
          <View style={styles.progress}>
            <ProgressBar done={summary.itemsDone} total={summary.itemsTotal} note={`${summary.roomsDone} of ${summary.roomsTotal} rooms`} />
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
                a11y="Room name"
              />
            ) : (
              <Row
                key={room.id}
                first={idx === 0}
                onPress={editing ? () => setRenaming({ id: room.id, name: room.name }) : () => router.push(`/inspection/${inspectionId}/room/${room.id}`)}
                a11y={editing ? `Rename ${room.name}` : `Open ${room.name}, ${room.done} of ${room.total} items`}
                leading={
                  editing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${room.name}`}
                      onPress={() => confirmDelete(room)}
                      hitSlop={10}
                      style={[styles.minus, { backgroundColor: c.damaged }]}
                    >
                      <Text style={[styles.minusText, { color: c.onInk }]}>−</Text>
                    </Pressable>
                  ) : undefined
                }
                trailing={
                  editing ? (
                    <View style={styles.reorder}>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${room.name} up`} hitSlop={8} onPress={() => run((db) => moveRoom(db, room.id, 'up'))} style={styles.arrow}>
                        <Text style={[styles.arrowText, { color: c.ink60 }]}>↑</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" accessibilityLabel={`Move ${room.name} down`} hitSlop={8} onPress={() => run((db) => moveRoom(db, room.id, 'down'))} style={styles.arrow}>
                        <Text style={[styles.arrowText, { color: c.ink60 }]}>↓</Text>
                      </Pressable>
                    </View>
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
                        {room.done} of {room.total}
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
              <InlineInput value={adding} onChangeText={setAdding} onSubmit={add} onCancel={() => setAdding(null)} placeholder="Room name" a11y="New room name" submitLabel="Add" />
            ) : (
              <Row first={rooms.length === 0} onPress={() => setAdding('')} a11y="Add room" trailing={<View />} leading={<View style={[styles.plus, { borderColor: c.ink30 }]}><Text style={[styles.plusText, { color: c.ink60 }]}>+</Text></View>}>
                <Text style={[styles.addText, { color: c.ink60 }]}>Add room</Text>
              </Row>
            ))}
        </Group>
        <Button
          label={deleting ? 'Deleting' : 'Delete inspection'}
          a11y="Delete inspection"
          testID="delete-inspection"
          variant="danger"
          onPress={confirmDeleteInspection}
          busy={deleting}
          style={styles.delete}
        />
      </Screen>
      {!editing && (
        <Floating>
          {locked ? (
            <View style={styles.stack}>
              <Button label="Export report" onPress={() => router.push(`/inspection/${inspectionId}/export`)} />
              {comparable && (
                <Button label={comparing ? 'Building comparison' : 'Export comparison'} a11y="Export comparison" variant="secondary" onPress={shareComparison} busy={comparing} />
              )}
              {inspection?.kind === 'move_in' && (
                <Button label="Start move-out" variant="secondary" onPress={startMoveOut} busy={starting} />
              )}
            </View>
          ) : allDone ? (
            <Button label="Finish inspection" onPress={confirmFinish} />
          ) : next ? (
            <Button
              label={`Continue with ${next.name}`}
              trailing={`${roomsLeft} ${roomsLeft === 1 ? 'room' : 'rooms'} left`}
              onPress={() => router.push(`/inspection/${inspectionId}/room/${next.id}`)}
            />
          ) : null}
        </Floating>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 15, marginTop: -4, marginBottom: 12, marginLeft: 4 },
  stack: { gap: 8 },
  delete: { marginTop: 32 },
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
