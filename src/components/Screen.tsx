import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

const FLOATING_BOTTOM = 28;
// Clear space between the end of the content and the top of the floating action.
const FLOATING_GAP = 40;

/**
 * Scrolling screen body under a transparent large-title header. `floating` is a primary action pinned over the
 * bottom, clear of the home indicator. The content's bottom padding follows its measured height, so the last row
 * can always scroll clear of it, even when Dynamic Type makes the action several lines tall.
 */
export function Screen({
  children,
  style,
  floating,
  scrollEnabled = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  floating?: ReactNode;
  scrollEnabled?: boolean;
}) {
  const { c } = useTheme();
  const [floatingHeight, setFloatingHeight] = useState(0);
  return (
    <>
      <ScrollView
        style={{ backgroundColor: c.plaster }}
        scrollEnabled={scrollEnabled}
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        // A decimal pad has no return key, so dragging the list is the way to put it away.
        keyboardDismissMode="on-drag"
        contentContainerStyle={[
          styles.content,
          !!floating && floatingHeight > 0 && { paddingBottom: Math.max(120, floatingHeight + FLOATING_BOTTOM + FLOATING_GAP) },
          style,
        ]}
      >
        {children}
      </ScrollView>
      {!!floating && (
        <View style={styles.floating} onLayout={(e) => setFloatingHeight(e.nativeEvent.layout.height)}>
          {floating}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  floating: { position: 'absolute', left: 16, right: 16, bottom: FLOATING_BOTTOM },
});
