import { Stack, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { getDb } from '@/db/client';
import { listInspectionItems, listInspections, listRooms } from '@/db/repo';
import type { Inspection } from '@/db/types';
import { progress, type Progress } from '@/lib/progress';

type Row = Inspection & { progress: Progress | null };

export default function Home() {
  const [inspections, setInspections] = useState<Row[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const db = await getDb();
        // ponytail: two queries per unfinished inspection; fine for a renter's handful of inspections.
        const rows = await Promise.all(
          (await listInspections(db)).map(async (i) => ({
            ...i,
            progress:
              i.finished_at == null
                ? progress(await listRooms(db, i.id), await listInspectionItems(db, i.id))
                : null,
          })),
        );
        if (active) setInspections(rows);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Unscratched' }} />
      <Pressable
        style={styles.button}
        accessibilityRole="button"
        accessibilityLabel="New move-in inspection"
        onPress={() => router.push('/inspection/new')}
      >
        <Text style={styles.buttonText}>New move-in inspection</Text>
      </Pressable>
      <FlatList
        data={inspections}
        keyExtractor={(i) => String(i.id)}
        ListEmptyComponent={<Text style={styles.empty}>No inspections yet.</Text>}
        renderItem={({ item }) => {
          const kind = item.kind === 'move_in' ? 'Move-in' : 'Move-out';
          const started = new Date(item.started_at).toLocaleDateString();
          return (
            <Pressable
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={`${item.address}${item.unit ? `, unit ${item.unit}` : ''}, ${kind}`}
              onPress={() => router.push(`/inspection/${item.id}`)}
            >
              <View style={styles.rowMain}>
                <Text style={styles.address}>
                  {item.address}
                  {item.unit ? `, ${item.unit}` : ''}
                </Text>
                <Text style={styles.meta}>
                  {kind} · {started}
                </Text>
              </View>
              {item.progress ? (
                <Text style={styles.meta}>
                  {item.progress.roomsDone}/{item.progress.roomsTotal} rooms
                </Text>
              ) : (
                <Text style={styles.badge}>Finished</Text>
              )}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  button: { minHeight: 48, borderRadius: 8, backgroundColor: '#1a73e8', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#666', marginTop: 24 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#ccc' },
  rowMain: { flex: 1 },
  address: { fontSize: 16, fontWeight: '500' },
  meta: { marginTop: 2, color: '#666' },
  badge: { color: '#137333', fontWeight: '600' },
});
