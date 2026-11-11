import { StyleSheet, View } from 'react-native';

import type { Condition } from '@/db/types';
import { useTheme } from '@/theme';

/** Shape-coded condition mark: dot (good), half ring (fair), diamond (damaged), hollow ring (not checked). */
export function ConditionMark({ condition, size = 12 }: { condition: Condition | null; size?: number }) {
  const { c } = useTheme();
  const base = { width: size, height: size, borderRadius: size / 2 };
  if (condition === 'good') return <View style={[base, { backgroundColor: c.good }]} />;
  if (condition === 'fair')
    return (
      <View style={[base, styles.clip, { borderWidth: 1.5, borderColor: c.fair }]}>
        <View style={{ width: size / 2 - 1, height: size, backgroundColor: c.fair }} />
      </View>
    );
  if (condition === 'damaged')
    return (
      <View style={[styles.center, { width: size, height: size }]}>
        <View style={{ width: size * 0.72, height: size * 0.72, borderRadius: 1, backgroundColor: c.damaged, transform: [{ rotate: '45deg' }] }} />
      </View>
    );
  return <View style={[base, { borderWidth: 1.5, borderColor: c.ink60 }]} />;
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden', alignItems: 'flex-start' },
  center: { alignItems: 'center', justifyContent: 'center' },
});
