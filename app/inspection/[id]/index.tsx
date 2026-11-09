import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { FinishedBanner } from '@/components/FinishedBanner';
import { getDb } from '@/db/client';
import {
  addRoom,
  deleteRoom,
  finishInspection,
  getInspection,
  listInspectionItems,
  listRooms,
  moveRoom,
  renameRoom,
} from '@/db/repo';
import type { Room } from '@/db/types';
import { progress, type Progress } from '@/lib/progress';
import { exportComparison } from '@/report/exportComparison';

type RoomRow = Room & { done: number; total: number };

export default function RoomList() {
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [address, setAddress] = useState('');
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [comparable, setComparable] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [summary, setSummary] = useState<Progress | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    const inspection = await getInspection(db, inspectionId);
    setAddress(inspection?.address ?? '');
    setFinishedAt(inspection?.finished_at ?? null);
    setComparable(inspection?.kind === 'move_out' && inspection.linked_move_in_id != null);
    const [list, items] = await Promise.all([listRooms(db, inspectionId), listInspectionItems(db, inspectionId)]);
    setSummary(progress(list, items));
    setRooms(
      list.map((room) => {
        const own = items.filter((i) => i.room_id === room.id);
        return { ...room, done: own.filter((i) => i.condition != null).length, total: own.length };
      }),
    );
  }, [inspectionId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const run = async (action: (db: Awaited<ReturnType<typeof getDb>>) => Promise<unknown>) => {
    await action(await getDb());
    await load();
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    setNewName('');
    await run((db) => addRoom(db, inspectionId, name));
  };

  const saveRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    setEditing(null);
    if (name) await run((db) => renameRoom(db, editing.id, name));
  };

  const confirmDelete = (room: Room) =>
    Alert.alert('Delete room?', `"${room.name}" and all its items and photos will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run((db) => deleteRoom(db, room.id)) },
    ]);

  const confirmFinish = () =>
    Alert.alert(
      'Finish inspection?',
      "A finished inspection can't be edited. Conditions, notes, rooms, and photos will be locked so the report can be trusted.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Finish', onPress: () => run((db) => finishInspection(db, inspectionId)) },
      ],
    );

  const shareComparison = async () => {
    if (comparing) return;
    setComparing(true);
    try {
      await exportComparison(await getDb(), inspectionId);
    } catch (e) {
      Alert.alert('Comparison export failed', e instanceof Error ? e.message : String(e));
    } finally {
      setComparing(false);
    }
  };

  const locked = finishedAt != null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: address }} />
      {locked && <FinishedBanner finishedAt={finishedAt} />}
      {summary && (
        <Text style={styles.summary}>
          {summary.roomsDone} of {summary.roomsTotal} rooms done
        </Text>
      )}
      <FlatList
        data={rooms}
        keyExtractor={(r) => String(r.id)}
        renderItem={({ item: room }) =>
          editing?.id === room.id ? (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.grow]}
                value={editing.name}
                onChangeText={(name) => setEditing({ id: room.id, name })}
                accessibilityLabel="Room name"
                autoFocus
              />
              <Button label="Save" onPress={saveRename} />
              <Button label="Cancel" onPress={() => setEditing(null)} />
            </View>
          ) : (
            <View style={styles.row}>
              <Pressable
                style={styles.grow}
                onPress={() => router.push(`/inspection/${inspectionId}/room/${room.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${room.name}`}
              >
                <Text style={styles.name}>{room.name}</Text>
                <Text style={styles.meta}>
                  {room.done}/{room.total} items
                </Text>
              </Pressable>
              {!locked && (
                <>
                  <Button
                    label="Up"
                    a11y={`Move ${room.name} up`}
                    onPress={() => run((db) => moveRoom(db, room.id, 'up'))}
                  />
                  <Button
                    label="Down"
                    a11y={`Move ${room.name} down`}
                    onPress={() => run((db) => moveRoom(db, room.id, 'down'))}
                  />
                  <Button
                    label="Rename"
                    a11y={`Rename ${room.name}`}
                    onPress={() => setEditing({ id: room.id, name: room.name })}
                  />
                  <Button label="Delete" a11y={`Delete ${room.name}`} onPress={() => confirmDelete(room)} />
                </>
              )}
            </View>
          )
        }
      />
      {locked && (
        <Pressable
          style={styles.finish}
          onPress={() => router.push(`/inspection/${inspectionId}/export`)}
          accessibilityRole="button"
          accessibilityLabel="Export report"
        >
          <Text style={styles.finishText}>Export report</Text>
        </Pressable>
      )}
      {locked && comparable && (
        <Pressable
          style={[styles.finish, comparing && styles.disabled]}
          onPress={shareComparison}
          disabled={comparing}
          accessibilityRole="button"
          accessibilityLabel="Export comparison"
        >
          <Text style={styles.finishText}>{comparing ? 'Building comparison...' : 'Export comparison'}</Text>
        </Pressable>
      )}
      {!locked && (
        <>
          <View style={styles.row}>
            <TextInput
              style={[styles.input, styles.grow]}
              value={newName}
              onChangeText={setNewName}
              placeholder="New room name"
              accessibilityLabel="New room name"
              onSubmitEditing={add}
            />
            <Button label="Add room" onPress={add} />
          </View>
          <Pressable
            style={styles.finish}
            onPress={confirmFinish}
            accessibilityRole="button"
            accessibilityLabel="Finish inspection"
          >
            <Text style={styles.finishText}>Finish inspection</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4, paddingVertical: 4 },
  grow: { flex: 1, minHeight: 44, justifyContent: 'center' },
  name: { fontSize: 17 },
  summary: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  meta: { fontSize: 13, color: '#666' },
  finish: { minHeight: 48, borderRadius: 8, backgroundColor: '#137333', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabled: { opacity: 0.5 },
  finishText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 8, fontSize: 16 },
});
