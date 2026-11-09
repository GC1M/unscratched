import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { getDb } from '@/db/client';
import { addItem, deleteItem, listItems, listRooms, renameItem } from '@/db/repo';
import type { Item } from '@/db/types';

const CONDITION_LABEL = { good: 'Good', fair: 'Fair', damaged: 'Damaged' } as const;

export default function RoomItems() {
  const params = useLocalSearchParams<{ id: string; roomId: string }>();
  const inspectionId = Number(params.id);
  const roomId = Number(params.roomId);
  const [roomName, setRoomName] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const db = await getDb();
    // repo has no getRoom; the room list for this inspection is small.
    const rooms = await listRooms(db, inspectionId);
    setRoomName(rooms.find((r) => r.id === roomId)?.name ?? '');
    setItems(await listItems(db, roomId));
  }, [inspectionId, roomId]);

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
    await run((db) => addItem(db, roomId, name));
  };

  const saveRename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    setEditing(null);
    if (name) await run((db) => renameItem(db, editing.id, name));
  };

  const confirmDelete = (item: Item) =>
    Alert.alert('Delete item?', `"${item.name}" and its photos will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run((db) => deleteItem(db, item.id)) },
    ]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: roomName }} />
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={({ item }) =>
          editing?.id === item.id ? (
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.grow]}
                value={editing.name}
                onChangeText={(name) => setEditing({ id: item.id, name })}
                accessibilityLabel="Item name"
                autoFocus
              />
              <Button label="Save" onPress={saveRename} />
              <Button label="Cancel" onPress={() => setEditing(null)} />
            </View>
          ) : (
            <View style={styles.row}>
              <Pressable
                style={styles.grow}
                onPress={() => router.push(`/item/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.name}`}
              >
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{item.condition ? CONDITION_LABEL[item.condition] : 'Not set'}</Text>
              </Pressable>
              <Button
                label="Rename"
                a11y={`Rename ${item.name}`}
                onPress={() => setEditing({ id: item.id, name: item.name })}
              />
              <Button label="Delete" a11y={`Delete ${item.name}`} onPress={() => confirmDelete(item)} />
            </View>
          )
        }
      />
      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.grow]}
          value={newName}
          onChangeText={setNewName}
          placeholder="New item name"
          accessibilityLabel="New item name"
          onSubmitEditing={add}
        />
        <Button label="Add item" onPress={add} />
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
