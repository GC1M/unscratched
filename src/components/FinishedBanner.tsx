import { StyleSheet, Text, View } from 'react-native';

import { radius, useTheme } from '@/theme';

/** Shown on read-only screens of a finished inspection. */
export function FinishedBanner({ finishedAt }: { finishedAt: number }) {
  const { c } = useTheme();
  const date = new Date(finishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <View style={[styles.banner, { backgroundColor: c.paper }]}>
      <Text style={[styles.text, { color: c.ink }]}>Finished {date}. Locked so the report can be trusted.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.tile, padding: 14, marginBottom: 12 },
  text: { fontSize: 15, fontWeight: '600' },
});
