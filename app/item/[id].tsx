import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FinishedBanner } from '@/components/FinishedBanner';
import { getDb } from '@/db/client';
import { photoUri } from '@/lib/photos';
import { getFinishedAt, getItem, listPhotos, setCondition, setNote } from '@/db/repo';
import type { Condition, Item, Photo } from '@/db/types';

const CONDITIONS: { value: Condition; label: string }[] = [
  { value: 'good', label: 'Good' },
  { value: 'fair', label: 'Fair' },
  { value: 'damaged', label: 'Damaged' },
];

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const itemId = Number(id);
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [note, setNoteText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const locked = finishedAt != null;

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        const [loaded, loadedPhotos, finished] = await Promise.all([
          getItem(db, itemId),
          listPhotos(db, itemId),
          getFinishedAt(db, 'item', itemId),
        ]);
        if (!active) return;
        setFinishedAt(finished);
        setItem(loaded);
        setNoteText(loaded?.note ?? '');
        setPhotos(loadedPhotos);
      })();
      return () => {
        active = false;
      };
    }, [itemId]),
  );

  async function onChip(value: Condition) {
    if (!item || locked) return;
    const next = item.condition === value ? null : value;
    setItem({ ...item, condition: next });
    await setCondition(await getDb(), itemId, next);
  }

  async function onNoteBlur() {
    if (locked) return;
    await setNote(await getDb(), itemId, note.trim() === '' ? null : note);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: item?.name ?? '' }} />
      {locked && <FinishedBanner finishedAt={finishedAt} />}

      <Text style={styles.heading}>Condition</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {CONDITIONS.map(({ value, label }) => {
          const selected = item?.condition === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ selected, disabled: locked }}
              disabled={locked}
              onPress={() => onChip(value)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.heading}>Note</Text>
      <TextInput
        accessibilityLabel="Note"
        multiline
        placeholder="Describe any marks, damage, or wear"
        value={note}
        onChangeText={setNoteText}
        onBlur={onNoteBlur}
        editable={!locked}
        style={styles.note}
      />

      <Text style={styles.heading}>Photos</Text>
      <ScrollView horizontal contentContainerStyle={styles.photos}>
        {photos.map((p, i) => (
          <Image key={p.id} accessibilityLabel={`Photo ${i + 1}`} source={{ uri: photoUri(p) }} style={styles.thumb} />
        ))}
      </ScrollView>
      {!locked && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photo"
          onPress={() => router.push(`/camera/${itemId}`)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Add photo</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16 },
  heading: { fontSize: 16, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#999',
  },
  chipSelected: { backgroundColor: '#1f6feb', borderColor: '#1f6feb' },
  chipText: { fontSize: 16, color: '#222' },
  chipTextSelected: { color: '#fff' },
  note: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  photos: { gap: 8 },
  thumb: { width: 80, height: 80, borderRadius: 6, backgroundColor: '#eee' },
  button: {
    minHeight: 44,
    marginTop: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#1f6feb',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
