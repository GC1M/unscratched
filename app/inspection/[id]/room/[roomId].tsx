import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { CONDITION_LABEL, ConditionMark } from '@/components/ConditionMark';
import { FinishedBanner } from '@/components/FinishedBanner';
import { Group, Row, RowMeta, RowTitle } from '@/components/Group';
import { InlineInput } from '@/components/InlineInput';
import { Floating, Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { addItem, countPhotosByItem, deleteItem, getInspection, getRoom, listItems, renameItem } from '@/db/repo';
import type { Item, Room } from '@/db/types';
import { nextUnchecked } from '@/lib/next';
import { useTheme } from '@/theme';

export default function RoomItems() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ id: string; roomId: string }>();
  const inspectionId = Number(params.id);
  const roomId = Number(params.roomId);
  // undefined while loading, null when it no longer exists.
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [photos, setPhotos] = useState<Map<number, number>>(new Map());
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    let found, list, counts, inspection;
    try {
      const db = await getDb();
      [found, list, counts, inspection] = await Promise.all([
        getRoom(db, roomId),
        listItems(db, roomId),
        countPhotosByItem(db, roomId),
        getInspection(db, inspectionId),
      ]);
    } catch (e) {
      setError(e);
      return;
    }
    setRoom(found);
    setItems(list);
    setPhotos(counts);
    setFinishedAt(inspection?.finished_at ?? null);
  }, [inspectionId, roomId]);

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
    if (name) await run((db) => addItem(db, roomId, name));
  };

  const saveRename = async () => {
    if (!renaming) return;
    const name = renaming.name.trim();
    setRenaming(null);
    if (name) await run((db) => renameItem(db, renaming.id, name));
  };

  const confirmDelete = (item: Item) =>
    Alert.alert('Delete item?', `"${item.name}" and its photos will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run((db) => deleteItem(db, item.id)) },
    ]);

  const locked = finishedAt != null;
  const checked = items.filter((i) => i.condition != null).length;
  const next = nextUnchecked(items, -1);
  const left = items.length - checked;

  const meta = (item: Item) => {
    const n = photos.get(item.id) ?? 0;
    const cond = item.condition ? CONDITION_LABEL[item.condition] : 'Not checked';
    return n === 0 ? cond : `${cond}, ${n} ${n === 1 ? 'photo' : 'photos'}`;
  };

  if (error || room === null)
    return (
      <Screen>
        {error ? (
          <Problem title="Could not load this room" body={errorMessage(error)} onRetry={load} />
        ) : (
          <Problem title="Room not found" body="It may have been deleted." />
        )}
      </Screen>
    );
  if (room === undefined)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return (
    <>
      <Stack.Screen options={{ title: room.name }}>
        {!locked && (
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button accessibilityLabel={editing ? 'Done editing' : 'Edit items'} onPress={() => setEditing((e) => !e)}>
              {editing ? 'Done' : 'Edit'}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        )}
      </Stack.Screen>
      <Screen>
        <Text style={[styles.subtitle, { color: c.ink60 }]}>
          {checked} of {items.length} items checked
        </Text>
        {locked && <FinishedBanner finishedAt={finishedAt} />}
        <Group>
          {items.map((item, idx) =>
            renaming?.id === item.id ? (
              <InlineInput
                key={item.id}
                value={renaming.name}
                onChangeText={(name) => setRenaming({ id: item.id, name })}
                onSubmit={saveRename}
                onCancel={() => setRenaming(null)}
                a11y="Item name"
              />
            ) : (
              <Row
                key={item.id}
                first={idx === 0}
                onPress={editing ? () => setRenaming({ id: item.id, name: item.name }) : () => router.push(`/item/${item.id}`)}
                a11y={editing ? `Rename ${item.name}` : `Open ${item.name}, ${meta(item)}`}
                leading={
                  editing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${item.name}`}
                      onPress={() => confirmDelete(item)}
                      hitSlop={10}
                      style={[styles.minus, { backgroundColor: c.damaged }]}
                    >
                      <Text style={[styles.minusText, { color: c.onInk }]}>−</Text>
                    </Pressable>
                  ) : (
                    <ConditionMark condition={item.condition} />
                  )
                }
                trailing={editing ? <View /> : undefined}
              >
                <RowTitle>{item.name}</RowTitle>
                <RowMeta>{meta(item)}</RowMeta>
              </Row>
            ),
          )}
          {!locked &&
            (adding != null ? (
              <InlineInput value={adding} onChangeText={setAdding} onSubmit={add} onCancel={() => setAdding(null)} placeholder="Item name" a11y="New item name" submitLabel="Add" />
            ) : (
              <Row first={items.length === 0} onPress={() => setAdding('')} a11y="Add item" trailing={<View />} leading={<View style={[styles.plus, { borderColor: c.ink30 }]}><Text style={[styles.plusText, { color: c.ink60 }]}>+</Text></View>}>
                <Text style={[styles.addText, { color: c.ink60 }]}>Add item</Text>
              </Row>
            ))}
        </Group>
      </Screen>
      {!locked && !editing && next && (
        <Floating>
          <Button label={`Continue with ${next.name}`} trailing={`${left} left`} onPress={() => router.push(`/item/${next.id}`)} />
        </Floating>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 15, marginTop: -4, marginBottom: 16, marginLeft: 4 },
  minus: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  minusText: { fontSize: 18, lineHeight: 20, fontWeight: '600' },
  plus: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontSize: 16, lineHeight: 18 },
  addText: { fontSize: 17 },
});
