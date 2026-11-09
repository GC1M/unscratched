import { StyleSheet, Text } from 'react-native';

/** Shown on read-only screens of a finished inspection. */
export function FinishedBanner({ finishedAt }: { finishedAt: number }) {
  return <Text style={styles.banner}>Finished {new Date(finishedAt).toLocaleDateString()}</Text>;
}

const styles = StyleSheet.create({
  banner: { backgroundColor: '#e6f4ea', color: '#137333', fontWeight: '600', padding: 12, borderRadius: 8, marginBottom: 8 },
});
