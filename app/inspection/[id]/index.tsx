import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { getDb } from '@/db/client';
import { addRoom, deleteRoom, getInspection, listItems, listRooms, moveRoom, renameRoom } from '@/db/repo';
import type { Room } from '@/db/types';

type RoomRow = Room & { done: number; total: number };

export default function RoomList() {
  const inspectionId = Number(useLocalSearchParams<{ id: string }>().id);
  const [address, setAddress] = useState('');
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    const inspection = await getInspection(db, inspectionId);
    setAddress(inspection?.address ?? '');
    const list = await listRooms(db, inspectionId);
    // ponytail: one query per room; the real progress module lands in #12.
    const rows = await Promise.all(
      list.map(async (room) => {
        const items = await listItems(db, room.id);
        return { ...room, done: items.filter((i) => i.condition !== null).length, total: items.length };
      }),
    );
    setRooms(rows);
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

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: address }} />
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
              <Button label="Up" a11y={`Move ${room.name} up`} onPress={() => run((db) => moveRoom(db, room.id, 'up'))} />
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
            </View>
          )
        }
      />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 4, paddingVertical: 4 },
  grow: { flex: 1, minHeight: 44, justifyContent: 'center' },
  name: { fontSize: 17 },
  meta: { fontSize: 13, color: '#666' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 8, fontSize: 16 },
});
