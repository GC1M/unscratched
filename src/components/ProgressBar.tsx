import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/theme';

/** Hairline progress bar with "done of total items" and an optional secondary note. */
export function ProgressBar({ done, total, note }: { done: number; total: number; note?: string }) {
  const { c } = useTheme();
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`${done} of ${total} items checked${note ? `, ${note}` : ''}`}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
    >
      <View style={[styles.track, { backgroundColor: c.hair }]}>
        <View style={[styles.fill, { backgroundColor: c.ink, width: `${pct}%` }]} />
      </View>
      <Text style={[styles.text, { color: c.ink60 }]}>
        <Text style={{ color: c.ink, fontWeight: '600' }}>
          {done} of {total} items
        </Text>
        {note ? `, ${note}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  track: { flex: 1, minWidth: 48, height: 3, borderRadius: 2, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 2 },
  text: { flexShrink: 1, fontSize: 13, fontVariant: ['tabular-nums'] },
});
