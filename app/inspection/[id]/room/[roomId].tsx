import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { ConditionMark } from '@/components/ConditionMark';
import { FinishedBanner } from '@/components/FinishedBanner';
import { Group, Row, RowMeta, RowTitle } from '@/components/Group';
import { InlineInput } from '@/components/InlineInput';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { addItem, countPhotosByItem, deleteItem, getInspection, getRoom, listItems, renameItem } from '@/db/repo';
import type { Item, Room } from '@/db/types';
import { useT } from '@/i18n/context';
import { nextUnchecked } from '@/lib/next';
import { useTheme } from '@/theme';

export default function RoomItems() {
  const { c } = useTheme();
  const { t } = useT();
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
      Alert.alert(t('common.somethingWrong'), errorMessage(e));
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
    Alert.alert(t('items.deleteTitle'), t('items.deleteBody', { name: item.name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => run((db) => deleteItem(db, item.id)) },
    ]);

  const locked = finishedAt != null;
  const checked = items.filter((i) => i.condition != null).length;
  const next = nextUnchecked(items, -1);
  const left = items.length - checked;

  const meta = (item: Item) => {
    const n = photos.get(item.id) ?? 0;
    const condition = t(item.condition ? `condition.${item.condition}` : 'condition.notChecked');
    return n === 0 ? condition : t(n === 1 ? 'items.photos.one' : 'items.photos.other', { condition, n });
  };

  if (error || room === null)
    return (
      <Screen>
        {error ? (
          <Problem title={t('items.loadError')} body={errorMessage(error)} onRetry={load} />
        ) : (
          <Problem title={t('items.notFound')} body={t('common.mayBeDeleted')} />
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
            <Stack.Toolbar.Button accessibilityLabel={t(editing ? 'common.doneEditing' : 'items.editItems')} onPress={() => setEditing((e) => !e)}>
              {t(editing ? 'common.done' : 'common.edit')}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        )}
      </Stack.Screen>
      <Screen
        floating={
          locked || editing || items.length === 0 ? null : next ? (
            <Button label={t('common.continueWith', { name: next.name })} trailing={t('common.left', { n: left })} onPress={() => router.push(`/item/${next.id}`)} />
          ) : (
            // Every item is checked: head back to the room list, which offers the next room or Finish.
            <Button label={t('item.doneWith', { name: room.name })} variant="secondary" onPress={() => router.dismissTo(`/inspection/${inspectionId}`)} />
          )
        }
      >
        <Text style={[styles.subtitle, { color: c.ink60 }]}>
          {t('common.ofItemsChecked', { done: checked, total: items.length })}
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
                a11y={t('items.itemName')}
              />
            ) : (
              <Row
                key={item.id}
                first={idx === 0}
                onPress={editing ? () => setRenaming({ id: item.id, name: item.name }) : () => router.push(`/item/${item.id}`)}
                a11y={editing ? t('rooms.rename', { name: item.name }) : t('items.open', { name: item.name, meta: meta(item) })}
                controlsBefore={
                  editing ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('rooms.deleteNamed', { name: item.name })}
                      onPress={() => confirmDelete(item)}
                      hitSlop={10}
                      style={[styles.minus, { backgroundColor: c.damaged }]}
                    >
                      <Text maxFontSizeMultiplier={1} style={[styles.minusText, { color: c.onInk }]}>−</Text>
                    </Pressable>
                  ) : undefined
                }
                leading={editing ? undefined : <ConditionMark condition={item.condition} />}
                trailing={editing ? <View /> : undefined}
              >
                <RowTitle>{item.name}</RowTitle>
                <RowMeta>{meta(item)}</RowMeta>
              </Row>
            ),
          )}
          {!locked &&
            (adding != null ? (
              <InlineInput value={adding} onChangeText={setAdding} onSubmit={add} onCancel={() => setAdding(null)} placeholder={t('items.itemName')} a11y={t('items.newItemName')} submitLabel={t('common.add')} />
            ) : (
              <Row first={items.length === 0} onPress={() => setAdding('')} a11y={t('items.addItem')} trailing={<View />} leading={<View style={[styles.plus, { borderColor: c.ink30 }]}><Text maxFontSizeMultiplier={1} style={[styles.plusText, { color: c.ink60 }]}>+</Text></View>}>
                <Text style={[styles.addText, { color: c.ink60 }]}>{t('items.addItem')}</Text>
              </Row>
            ))}
        </Group>
      </Screen>
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
