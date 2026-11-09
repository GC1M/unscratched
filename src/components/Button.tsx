import { Pressable, StyleSheet, Text } from 'react-native';

/** Small text button with a 44pt tap target. `a11y` overrides the accessibility label. */
export function Button({ label, a11y, onPress }: { label: string; a11y?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.button} onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y ?? label}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  text: { color: '#0a7ea4', fontSize: 15 },
});
