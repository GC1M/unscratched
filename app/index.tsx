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
import { useT } from '@/i18n/context';
import { shortDate } from '@/lib/format';
import { nextRoom } from '@/lib/next';
import { progress, type Progress } from '@/lib/progress';
import { radius, serif, useTheme } from '@/theme';

type HomeRow = Inspection & { progress: Progress | null; next: string | null };

const address = (i: Inspection) => `${i.address}${i.unit ? `, ${i.unit}` : ''}`;

export default function Home() {
  const { c } = useTheme();
  const { t, locale } = useT();
  const kind = (i: Inspection) => t(`kind.${i.kind}`);
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
        <Problem title={t('home.loadError')} body={errorMessage(error)} onRetry={() => load()} />
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
          <Stack.Toolbar.Button icon="plus" accessibilityLabel={t('home.newInspection')} onPress={() => router.push('/inspection/new')} />
          <Stack.Toolbar.Button icon="person.2" accessibilityLabel={t('home.expenses')} onPress={() => router.push('/expenses')} />
          <Stack.Toolbar.Button icon="gearshape" accessibilityLabel={t('home.settings')} onPress={() => router.push('/settings')} />
        </Stack.Toolbar>
      </Stack.Screen>
      <Screen
        floating={
          hero ? (
            <Button
              label={t('home.continue')}
              trailing={hero.next ? t('home.nextRoom', { name: hero.next }) : undefined}
              a11y={t('home.continueA11y', { address: address(hero) })}
              onPress={() => router.push(`/inspection/${hero.id}`)}
            />
          ) : (
            <Button label={t('home.newMoveIn')} onPress={() => router.push('/inspection/new')} />
          )
        }
      >
        {hero ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.continueAddress', { address: address(hero) })}
            onPress={() => router.push(`/inspection/${hero.id}`)}
            style={({ pressed }) => [styles.hero, { backgroundColor: c.paper }, pressed && { opacity: 0.85 }]}
          >
            <Text style={[styles.heroAddress, { color: c.ink }]}>{address(hero)}</Text>
            <Text style={[styles.heroMeta, { color: c.ink60 }]}>
              {t('common.kindStarted', { kind: kind(hero), date: shortDate(hero.started_at, locale) })}
            </Text>
            {hero.progress && (
              <ProgressBar
                done={hero.progress.itemsDone}
                total={hero.progress.itemsTotal}
                note={t('common.ofRooms', { done: hero.progress.roomsDone, total: hero.progress.roomsTotal })}
              />
            )}
          </Pressable>
        ) : inspections.length === 0 ? (
          <View style={styles.empty}>
            <Text accessibilityRole="header" style={[styles.emptyTitle, { color: c.ink }]}>
              {t('home.emptyTitle')}
            </Text>
            <Text style={[styles.emptyBody, { color: c.ink60 }]}>
              {t('home.emptyBody')}
            </Text>
          </View>
        ) : null}
        {rest.length > 0 && (
          <>
            <SectionLabel>{t('home.alsoInProgress')}</SectionLabel>
            <Group>
              {rest.map((i, idx) => (
                <Row
                  key={i.id}
                  first={idx === 0}
                  onPress={() => router.push(`/inspection/${i.id}`)}
                  a11y={`${address(i)}, ${kind(i)}`}
                  trailing={
                    <Text style={[styles.count, { color: c.ink60 }]}>
                      {t('common.ofRooms', { done: i.progress?.roomsDone ?? 0, total: i.progress?.roomsTotal ?? 0 })}
                    </Text>
                  }
                >
                  <RowTitle serif>{address(i)}</RowTitle>
                  <RowMeta>
                    {t('common.kindStarted', { kind: kind(i), date: shortDate(i.started_at, locale) })}
                  </RowMeta>
                </Row>
              ))}
            </Group>
          </>
        )}
        {finished.length > 0 && (
          <>
            <SectionLabel>{t('home.finished')}</SectionLabel>
            <Group>
              {finished.map((i, idx) => (
                <Row
                  key={i.id}
                  first={idx === 0}
                  onPress={() => router.push(`/inspection/${i.id}`)}
                  a11y={t('home.finishedA11y', { address: address(i), kind: kind(i) })}
                  trailing={
                    <View style={[styles.tag, { backgroundColor: c.plaster }]}>
                      <Text style={[styles.tagText, { color: c.ink60 }]}>{t('home.reportReady')}</Text>
                    </View>
                  }
                >
                  <RowTitle serif>{address(i)}</RowTitle>
                  <RowMeta>
                    {t('common.kindFinished', { kind: kind(i), date: shortDate(i.finished_at ?? 0, locale) })}
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
