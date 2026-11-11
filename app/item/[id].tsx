import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { Button } from '@/components/Button';
import { CONDITION_LABEL, ConditionMark } from '@/components/ConditionMark';
import { FinishedBanner } from '@/components/FinishedBanner';
import { SectionLabel } from '@/components/Group';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { getFinishedAt, getItem, getRoom, getSetting, listItems, listPhotos, setCondition, setNote } from '@/db/repo';
import type { Condition, Item, Photo } from '@/db/types';
import { findMoveInItem } from '@/lib/moveInMatch';
import { photoUri } from '@/lib/photos';
import { nextUnchecked } from '@/lib/next';
import { SUGGEST_SETTING, suggestNote, toCondition, type Suggestion } from '@/lib/suggestNote';
import { radius, useTheme } from '@/theme';

const CONDITIONS: Condition[] = ['good', 'fair', 'damaged'];

type SuggestState = { photoId: number } & (
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; value: Suggestion }
);

export default function ItemScreen() {
  const { c } = useTheme();
  const itemId = Number(useLocalSearchParams<{ id: string }>().id);
  // undefined while loading, null when it no longer exists.
  const [item, setItem] = useState<Item | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [siblings, setSiblings] = useState<Item[]>([]);
  const [roomName, setRoomName] = useState('');
  const [note, setNoteText] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  // Photos of the matching move-in item; null when this is not a move-out item with a match.
  const [moveInPhotos, setMoveInPhotos] = useState<Photo[] | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  // Opt-in AI note suggestions. When off, nothing below sends a request.
  const [suggestOn, setSuggestOn] = useState(false);
  const [suggestion, setSuggestion] = useState<SuggestState | null>(null);
  const { width, fontScale } = useWindowDimensions();
  const locked = finishedAt != null;

  // active() is false once the screen lost focus or moved to another item, so a slow load can't overwrite newer state.
  const load = useCallback(
    async (active: () => boolean = () => true) => {
      setError(null);
      try {
        const db = await getDb();
        const loaded = await getItem(db, itemId);
        if (!loaded) {
          if (active()) setItem(null);
          return;
        }
        const [room, list, loadedPhotos, finished, match, suggestSetting] = await Promise.all([
          getRoom(db, loaded.room_id),
          listItems(db, loaded.room_id),
          listPhotos(db, itemId),
          getFinishedAt(db, 'item', itemId),
          findMoveInItem(db, itemId),
          getSetting(db, SUGGEST_SETTING),
        ]);
        const matchPhotos = match ? await listPhotos(db, match.id) : null;
        if (!active()) return;
        setMoveInPhotos(matchPhotos);
        setItem(loaded);
        setRoomName(room?.name ?? '');
        setSiblings(list);
        setFinishedAt(finished);
        setNoteText(loaded.note ?? '');
        setPhotos(loadedPhotos);
        setSuggestOn(suggestSetting === '1');
      } catch (e) {
        if (active()) setError(e);
      }
    },
    [itemId],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  async function onPick(value: Condition) {
    if (!item || item.id !== itemId || locked) return;
    await onNoteBlur();
    const next = item.condition === value ? null : value;
    setItem({ ...item, condition: next });
    setSiblings((s) => s.map((i) => (i.id === itemId ? { ...i, condition: next } : i)));
    try {
      await setCondition(await getDb(), itemId, next);
    } catch (e) {
      setItem(item);
      setSiblings((s) => s.map((i) => (i.id === itemId ? item : i)));
      Alert.alert('Could not save condition', errorMessage(e));
    }
  }

  async function onSuggest(photo: Photo) {
    setSuggestion({ photoId: photo.id, status: 'loading' });
    let next: SuggestState;
    try {
      next = { photoId: photo.id, status: 'ready', value: await suggestNote(await getDb(), photo) };
    } catch (e) {
      next = { photoId: photo.id, status: 'error', message: errorMessage(e) };
    }
    // Ignore a late reply if the user moved on to another photo's suggestion or discarded this one.
    setSuggestion((s) => (s?.photoId === photo.id && s.status === 'loading' ? next : s));
  }

  /** Appends the caption to the note and sets the suggested condition. Only runs on the user's tap. */
  async function onApply(value: Suggestion) {
    if (!item || item.id !== itemId || locked) return;
    const nextNote = note.trim() ? `${note.trim()}\n${value.caption}` : value.caption;
    const condition = toCondition(value.severity);
    setSuggestion(null);
    setNoteText(nextNote);
    setItem({ ...item, condition });
    setSiblings((s) => s.map((i) => (i.id === itemId ? { ...i, condition } : i)));
    try {
      const db = await getDb();
      await setNote(db, itemId, nextNote);
      await setCondition(db, itemId, condition);
    } catch (e) {
      Alert.alert('Could not save suggestion', errorMessage(e));
      load();
    }
  }

  /** Saves the note; false (after telling the user) if it could not be saved. */
  async function onNoteBlur() {
    if (locked || !item || item.id !== itemId) return true;
    try {
      await setNote(await getDb(), itemId, note.trim() === '' ? null : note);
      return true;
    } catch (e) {
      Alert.alert('Could not save note', errorMessage(e));
      return false;
    }
  }

  // A note is otherwise saved on blur, which never fires if the app is backgrounded or swiped away mid-typing.
  const saveNote = useRef(onNoteBlur);
  useEffect(() => {
    saveNote.current = onNoteBlur;
  });
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void saveNote.current();
    });
    return () => sub.remove();
  }, []);

  async function go(fn: () => void) {
    if (await onNoteBlur()) fn();
  }

  const position = siblings.findIndex((i) => i.id === itemId) + 1;
  const next = nextUnchecked(siblings, itemId);
  const left = siblings.filter((i) => i.condition == null && i.id !== itemId).length;
  const tint = { good: c.good, fair: c.fairInk, damaged: c.damaged } as const;
  const tintBg = { good: c.goodBg, fair: c.fairBg, damaged: c.damagedBg } as const;
  // Three chips side by side clip "Damaged" past the accessibility text sizes, so stack them.
  const stacked = fontScale > 1.4;

  if (error || item === null)
    return (
      <Screen>
        {error ? (
          <Problem title="Could not load this item" body={errorMessage(error)} onRetry={() => load()} />
        ) : (
          <Problem title="Item not found" body="It may have been deleted." />
        )}
      </Screen>
    );
  if (item === undefined)
    return (
      <Screen>
        <Loading />
      </Screen>
    );

  return (
    <>
      <Stack.Screen options={{ title: item.name }} />
      <Screen
        floating={
          locked ? null : next ? (
            <Button label={`Next: ${next.name}`} trailing={`${left} left`} onPress={() => go(() => router.replace(`/item/${next.id}`))} />
          ) : (
            <Button label={`Done with ${roomName}`} variant="secondary" onPress={() => go(() => router.back())} />
          )
        }
      >
        <Text style={[styles.subtitle, { color: c.ink60 }]}>
          {roomName}, item {position} of {siblings.length}
        </Text>
        {locked && <FinishedBanner finishedAt={finishedAt} />}

        <SectionLabel>Condition</SectionLabel>
        <View style={[styles.track, stacked && styles.stacked, { backgroundColor: c.hair }]} accessibilityRole="radiogroup">
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
                  stacked && styles.optionStacked,
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
          placeholderTextColor={c.ink60}
          value={note}
          onChangeText={setNoteText}
          onBlur={onNoteBlur}
          editable={!locked}
          style={[styles.note, { backgroundColor: c.paper, color: c.ink }]}
        />

        <SectionLabel>Photos</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {photos.map((p, i) => {
            const image = (
              <Image key={p.id} accessible accessibilityRole="image" accessibilityLabel={`Photo ${i + 1}`} source={{ uri: photoUri(p) }} style={[styles.thumb, { backgroundColor: c.hair }]} />
            );
            if (!suggestOn || locked) return image;
            return (
              <View key={p.id} style={styles.photoCol}>
                {image}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Suggest note for photo ${i + 1}`}
                  disabled={suggestion?.status === 'loading'}
                  onPress={() => onSuggest(p)}
                  style={({ pressed }) => [styles.suggestLink, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.suggestLinkText, { color: c.ink }]}>Suggest note</Text>
                </Pressable>
              </View>
            );
          })}
          {!locked && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add photo"
              onPress={() => router.push(`/camera/${itemId}`)}
              style={({ pressed }) => [styles.add, { backgroundColor: c.paper }, pressed && { opacity: 0.8 }]}
            >
              <Text style={[styles.addPlus, { color: c.ink }]}>+</Text>
              <Text style={[styles.addText, { color: c.ink60 }]}>Add photo</Text>
            </Pressable>
          )}
        </ScrollView>
        {suggestOn && !locked && suggestion && photos.some((p) => p.id === suggestion.photoId) && (
          <View style={[styles.suggestCard, { backgroundColor: c.paper }]} accessibilityLiveRegion="polite">
            {suggestion.status === 'loading' ? (
              <View style={styles.suggestRow}>
                <ActivityIndicator color={c.ink60} />
                <Text style={[styles.suggestMeta, { color: c.ink60 }]}>Getting a suggestion</Text>
              </View>
            ) : suggestion.status === 'error' ? (
              <>
                <Text style={[styles.suggestText, { color: c.ink }]}>{suggestion.message}</Text>
                <View style={styles.suggestRow}>
                  <Button label="Try again" variant="secondary" onPress={() => onSuggest(photos.find((p) => p.id === suggestion.photoId)!)} style={styles.suggestButton} />
                  <Button label="Dismiss" variant="tertiary" onPress={() => setSuggestion(null)} style={styles.suggestButton} />
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.suggestMeta, { color: c.ink60 }]}>AI suggestion. Check it before applying.</Text>
                <Text style={[styles.suggestText, { color: c.ink }]}>{suggestion.value.caption}</Text>
                <Text style={[styles.suggestMeta, { color: c.ink60 }]}>Condition: {CONDITION_LABEL[toCondition(suggestion.value.severity)]}</Text>
                <View style={styles.suggestRow}>
                  <Button label="Apply" onPress={() => onApply(suggestion.value)} style={styles.suggestButton} />
                  <Button label="Discard" variant="secondary" onPress={() => setSuggestion(null)} style={styles.suggestButton} />
                </View>
              </>
            )}
          </View>
        )}
        {moveInPhotos && (
          <Button label="View move-in photo" variant="secondary" onPress={() => setPeekOpen(true)} style={styles.peekButton} />
        )}

        <Modal visible={peekOpen} animationType="slide" onRequestClose={() => setPeekOpen(false)}>
          <View style={styles.peek}>
            {moveInPhotos?.length ? (
              <ScrollView horizontal pagingEnabled>
                {moveInPhotos.map((p, i) => (
                  <Image
                    key={p.id}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`Move-in photo ${i + 1} of ${moveInPhotos.length}`}
                    source={{ uri: photoUri(p) }}
                    resizeMode="contain"
                    style={{ width, height: '100%' }}
                  />
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.peekEmpty}>No move-in photo for this item</Text>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setPeekOpen(false)} style={styles.peekClose}>
              <Text style={styles.peekCloseText}>Close</Text>
            </Pressable>
          </View>
        </Modal>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  subtitle: { fontSize: 15, marginTop: -4, marginBottom: 4, marginLeft: 4 },
  track: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: radius.capsule },
  stacked: { flexDirection: 'column' },
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
  optionStacked: { flexBasis: 'auto' },
  optionText: { fontSize: 16, fontWeight: '500' },
  note: { minHeight: 100, borderRadius: 20, padding: 16, fontSize: 16, textAlignVertical: 'top' },
  photos: { gap: 10 },
  thumb: { width: 88, height: 88, borderRadius: radius.tile },
  photoCol: { gap: 2, alignItems: 'center' },
  suggestLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  suggestLinkText: { fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  suggestCard: { marginTop: 12, borderRadius: 20, padding: 16, gap: 8 },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  suggestText: { fontSize: 16, lineHeight: 22 },
  suggestMeta: { fontSize: 13 },
  suggestButton: { flexGrow: 1 },
  add: { minWidth: 88, minHeight: 88, padding: 8, borderRadius: radius.tile, alignItems: 'center', justifyContent: 'center', gap: 2 },
  addPlus: { fontSize: 22, lineHeight: 24 },
  addText: { fontSize: 13, fontWeight: '500' },
  peekButton: { marginTop: 16 },
  peek: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  peekEmpty: { color: '#fff', fontSize: 16, textAlign: 'center', padding: 16 },
  peekClose: {
    position: 'absolute',
    top: 56,
    right: 16,
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  peekCloseText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
