import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

/** Paper panel that holds Rows. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[styles.group, { backgroundColor: c.paper }, style]}>{children}</View>;
}

/** Small secondary heading above a Group. */
export function SectionLabel({ children }: { children: string }) {
  const { c } = useTheme();
  return (
    <Text accessibilityRole="header" style={[styles.section, { color: c.ink60 }]}>
      {children}
    </Text>
  );
}

interface RowProps {
  children: ReactNode;
  /** Leading mark, e.g. a ConditionMark. */
  leading?: ReactNode;
  /** Trailing accessory. A chevron is drawn when onPress is set and no accessory is given. */
  trailing?: ReactNode;
  first?: boolean;
  onPress?: () => void;
  a11y?: string;
  selected?: boolean;
}

export function Row({ children, leading, trailing, first, onPress, a11y, selected }: RowProps) {
  const { c } = useTheme();
  const inner = (
    <>
      {!first && <View style={[styles.divider, { backgroundColor: c.hair, left: leading ? 44 : 16 }]} />}
      {leading}
      <View style={styles.main}>{children}</View>
      {trailing ?? (onPress && <View style={[styles.chevron, { borderColor: c.ink30 }]} />)}
    </>
  );
  if (!onPress) return <View style={styles.row}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={selected === undefined ? undefined : { selected }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.hair }]}
    >
      {inner}
    </Pressable>
  );
}

export function RowTitle({ children, serif }: { children: ReactNode; serif?: boolean }) {
  const { c } = useTheme();
  return <Text style={[serif ? styles.titleSerif : styles.title, { color: c.ink }]}>{children}</Text>;
}

export function RowMeta({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[styles.meta, { color: c.ink60 }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.panel, overflow: 'hidden' },
  section: { fontSize: 13, paddingTop: 22, paddingBottom: 8, paddingHorizontal: 4 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  divider: { position: 'absolute', top: 0, right: 0, height: StyleSheet.hairlineWidth },
  main: { flex: 1, minWidth: 0 },
  chevron: { width: 8, height: 8, borderRightWidth: 1.5, borderTopWidth: 1.5, transform: [{ rotate: '45deg' }], marginLeft: 4 },
  title: { fontSize: 17 },
  titleSerif: { fontSize: 19, fontFamily: 'Newsreader_400Regular' },
  meta: { fontSize: 13, marginTop: 2, fontVariant: ['tabular-nums'] },
});
