import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

/** Scrolling screen body under a transparent large-title header, with room for a floating button. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: c.plaster }}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, style]}
    >
      {children}
    </ScrollView>
  );
}

/** Floats a primary action over the bottom of the screen, clear of the home indicator. */
export function Floating({ children }: { children: ReactNode }) {
  return <View style={styles.floating}>{children}</View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  floating: { position: 'absolute', left: 16, right: 16, bottom: 28 },
});
