import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Group, Row, RowMeta, RowTitle, SectionLabel } from '@/components/Group';
import { ProgressBar } from '@/components/ProgressBar';
import { Screen } from '@/components/Screen';
import { Loading, Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { listInspectionItems, listInspections, listRooms } from '@/db/repo';
import type { Inspection } from '@/db/types';
import { kindLabel, shortDate } from '@/lib/format';
import { nextRoom } from '@/lib/next';
import { progress, type Progress } from '@/lib/progress';
import { radius, serif, useTheme } from '@/theme';

type HomeRow = Inspection & { progress: Progress | null; next: string | null };

const address = (i: Inspection) => `${i.address}${i.unit ? `, ${i.unit}` : ''}`;

export default function Home() {
  const { c } = useTheme();
  const [inspections, setInspections] = useState<HomeRow[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  // active() is false once the screen lost focus, so a slow load can't overwrite newer state.
  const load = useCallback(async (active: () => boolean = () => true) => {
    setError(null);
    try {
      const db = await getDb();
      // ponytail: two queries per unfinished inspection; fine for a renter's handful of inspections.
      const rows = await Promise.all(
        (await listInspections(db)).map(async (i) => {
          if (i.finished_at != null) return { ...i, progress: null, next: null };
          const [rooms, items] = await Promise.all([listRooms(db, i.id), listInspectionItems(db, i.id)]);
          return { ...i, progress: progress(rooms, items), next: nextRoom(rooms, items)?.name ?? null };
        }),
      );
      if (active()) setInspections(rows);
    } catch (e) {
      if (active()) setError(e);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  if (error)
    return (
      <Screen>
        <Problem title="Could not load inspections" body={errorMessage(error)} onRetry={() => load()} />
      </Screen>
    );
  if (!inspections)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  const [hero, ...rest] = inspections.filter((i) => i.finished_at == null);
  const finished = inspections.filter((i) => i.finished_at != null);

  return (
    <>
      <Stack.Screen>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon="plus" accessibilityLabel="New inspection" onPress={() => router.push('/inspection/new')} />
          <Stack.Toolbar.Button icon="gearshape" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
        </Stack.Toolbar>
      </Stack.Screen>
      <Screen
        floating={
          hero ? (
            <Button
              label="Continue inspection"
              trailing={hero.next ? `${hero.next} next` : undefined}
              a11y={`Continue inspection, ${address(hero)}`}
              onPress={() => router.push(`/inspection/${hero.id}`)}
            />
          ) : (
            <Button label="New move-in inspection" onPress={() => router.push('/inspection/new')} />
          )
        }
      >
        {hero ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Continue ${address(hero)}`}
            onPress={() => router.push(`/inspection/${hero.id}`)}
            style={({ pressed }) => [styles.hero, { backgroundColor: c.paper }, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.heroAddress, { color: c.ink }]}>{address(hero)}</Text>
            <Text style={[styles.heroMeta, { color: c.ink60 }]}>
              {kindLabel(hero.kind)}, started {shortDate(hero.started_at)}
            </Text>
            {hero.progress && (
              <ProgressBar
                done={hero.progress.itemsDone}
                total={hero.progress.itemsTotal}
                note={`${hero.progress.roomsDone} of ${hero.progress.roomsTotal} rooms`}
              />
            )}
          </Pressable>
        ) : inspections.length === 0 ? (
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={[styles.emptyTitle, { color: c.ink }]}>
              No inspections yet
            </Text>
            <Text style={[styles.emptyBody, { color: c.ink60 }]}>
              Walk each room before you unpack. About twenty minutes, and the report protects your deposit.
            </Text>
          </View>
        ) : null}
        {rest.length > 0 && (
          <>
            <SectionLabel>Also in progress</SectionLabel>
            <Group>
              {rest.map((i, idx) => (
                <Row
                  key={i.id}
                  first={idx === 0}
                  onPress={() => router.push(`/inspection/${i.id}`)}
                  a11y={`${address(i)}, ${kindLabel(i.kind)}`}
                  trailing={
                    <Text style={[styles.count, { color: c.ink60 }]}>
                      {i.progress?.roomsDone} of {i.progress?.roomsTotal} rooms
                    </Text>
                  }
                >
                  <RowTitle serif>{address(i)}</RowTitle>
                  <RowMeta>
                    {kindLabel(i.kind)}, started {shortDate(i.started_at)}
                  </RowMeta>
                </Row>
              ))}
            </Group>
          </>
        )}
        {finished.length > 0 && (
          <>
            <SectionLabel>Finished</SectionLabel>
            <Group>
              {finished.map((i, idx) => (
                <Row
                  key={i.id}
                  first={idx === 0}
                  onPress={() => router.push(`/inspection/${i.id}`)}
                  a11y={`${address(i)}, ${kindLabel(i.kind)}, finished`}
                  trailing={
                    <View style={[styles.tag, { backgroundColor: c.plaster }]}>
                      <Text style={[styles.tagText, { color: c.ink60 }]}>Report ready</Text>
                    </View>
                  }
                >
                  <RowTitle serif>{address(i)}</RowTitle>
                  <RowMeta>
                    {kindLabel(i.kind)}, finished {shortDate(i.finished_at ?? 0)}
                  </RowMeta>
                </Row>
              ))}
            </Group>
          </>
        )}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.panel, padding: 20, gap: 4 },
  heroAddress: { fontFamily: serif, fontSize: 26, lineHeight: 30 },
  heroMeta: { fontSize: 15, marginBottom: 12 },
  empty: { paddingTop: 48, paddingHorizontal: 4, gap: 8 },
  emptyTitle: { fontFamily: serif, fontSize: 26 },
  emptyBody: { fontSize: 15, lineHeight: 22 },
  count: { fontSize: 15, fontVariant: ['tabular-nums'] },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  tagText: { fontSize: 13, fontWeight: '600' },
});
