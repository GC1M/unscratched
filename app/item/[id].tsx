import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { CONDITION_LABEL, ConditionMark } from '@/components/ConditionMark';
import { FinishedBanner } from '@/components/FinishedBanner';
import { SectionLabel } from '@/components/Group';
import { Floating, Screen } from '@/components/Screen';
import { getDb } from '@/db/client';
import { getFinishedAt, getItem, getRoom, listItems, listPhotos, setCondition, setNote } from '@/db/repo';
import type { Condition, Item, Photo } from '@/db/types';
import { photoUri } from '@/lib/photos';
import { nextUnchecked } from '@/lib/next';
import { radius, useTheme } from '@/theme';

const CONDITIONS: Condition[] = ['good', 'fair', 'damaged'];

export default function ItemScreen() {
  const { c } = useTheme();
  const itemId = Number(useLocalSearchParams<{ id: string }>().id);
  const [item, setItem] = useState<Item | null>(null);
  const [siblings, setSiblings] = useState<Item[]>([]);
  const [roomName, setRoomName] = useState('');
  const [note, setNoteText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const locked = finishedAt != null;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        const loaded = await getItem(db, itemId);
        if (!loaded) return;
        const [room, list, loadedPhotos, finished] = await Promise.all([
          getRoom(db, loaded.room_id),
          listItems(db, loaded.room_id),
          listPhotos(db, itemId),
          getFinishedAt(db, 'item', itemId),
        ]);
        if (!active) return;
        setItem(loaded);
        setRoomName(room?.name ?? '');
        setSiblings(list);
        setFinishedAt(finished);
        setNoteText(loaded.note ?? '');
        setPhotos(loadedPhotos);
      })();
      return () => {
        active = false;
      };
    }, [itemId]),
  );

  async function onPick(value: Condition) {
    if (!item || locked) return;
    const next = item.condition === value ? null : value;
    setItem({ ...item, condition: next });
    setSiblings((s) => s.map((i) => (i.id === itemId ? { ...i, condition: next } : i)));
    await setCondition(await getDb(), itemId, next);
  }

  async function onNoteBlur() {
    if (locked) return;
    await setNote(await getDb(), itemId, note.trim() === '' ? null : note);
  }

  const position = siblings.findIndex((i) => i.id === itemId) + 1;
  const next = nextUnchecked(siblings, itemId);
  const left = siblings.filter((i) => i.condition == null && i.id !== itemId).length;
  const tint = { good: c.good, fair: c.fairInk, damaged: c.damaged } as const;
  const tintBg = { good: c.goodBg, fair: c.fairBg, damaged: c.damagedBg } as const;

  return (
    <>
      <Stack.Screen options={{ title: item?.name ?? '' }} />
      <Screen>
        <Text style={[styles.subtitle, { color: c.ink60 }]}>
          {roomName}, item {position} of {siblings.length}
        </Text>
        {locked && <FinishedBanner finishedAt={finishedAt} />}

        <SectionLabel>Condition</SectionLabel>
        <View style={[styles.track, { backgroundColor: c.hair }]} accessibilityRole="radiogroup">
          {CONDITIONS.map((value) => {
            const selected = item?.condition === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityLabel={CONDITION_LABEL[value]}
                accessibilityState={{ selected, disabled: locked }}
                disabled={locked}
                onPress={() => onPick(value)}
                style={({ pressed }) => [
                  styles.option,
                  selected && { backgroundColor: tintBg[value], borderColor: tint[value] },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <ConditionMark condition={value} size={10} />
                <Text style={[styles.optionText, { color: selected ? tint[value] : c.ink }]}>{CONDITION_LABEL[value]}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>Note</SectionLabel>
        <TextInput
          accessibilityLabel="Note"
          multiline
          placeholder="Describe any marks, damage, or wear"
          placeholderTextColor={c.ink30}
          value={note}
          onChangeText={setNoteText}
          onBlur={onNoteBlur}
          editable={!locked}
          style={[styles.note, { backgroundColor: c.paper, color: c.ink }]}
        />

        <SectionLabel>Photos</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((p, i) => (
            <Image key={p.id} accessibilityLabel={`Photo ${i + 1}`} source={{ uri: photoUri(p) }} style={[styles.thumb, { backgroundColor: c.hair }]} />
          ))}
          {!locked && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              onPress={() => router.push(`/camera/${itemId}`)}
              style={({ pressed }) => [styles.thumb, styles.add, { backgroundColor: c.paper }, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.addPlus, { color: c.ink }]}>+</Text>
              <Text style={[styles.addText, { color: c.ink60 }]}>Add photo</Text>
            </Pressable>
          )}
        </ScrollView>
      </Screen>
      {!locked && (
        <Floating>
          {next ? (
            <Button label={`Next: ${next.name}`} trailing={`${left} left`} onPress={() => router.replace(`/item/${next.id}`)} />
          ) : (
            <Button label={`Done with ${roomName}`} variant="secondary" onPress={() => router.back()} />
          )}
        </Floating>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 15, marginTop: -4, marginBottom: 4, marginLeft: 4 },
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.capsule },
  option: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.capsule - 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  optionText: { fontSize: 16, fontWeight: '500' },
  note: { minHeight: 100, borderRadius: 20, padding: 16, fontSize: 16, textAlignVertical: 'top' },
  photos: { gap: 10 },
  thumb: { width: 88, height: 88, borderRadius: radius.tile },
  add: { alignItems: 'center', justifyContent: 'center', gap: 2 },
  addPlus: { fontSize: 22, lineHeight: 24 },
  addText: { fontSize: 13, fontWeight: '500' },
});
