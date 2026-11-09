import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, useTheme } from '@/theme';

type Variant = 'primary' | 'secondary' | 'tertiary' | 'danger';

interface Props {
  label: string;
  /** Secondary text on the right edge, e.g. "2 left". */
  trailing?: string;
  variant?: Variant;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  /** Overrides the accessibility label. */
  a11y?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Capsule button. Primary is tinted ink glass on iOS 26, solid ink elsewhere. */
export function Button({ label, trailing, variant = 'primary', onPress, disabled, busy, a11y, style, testID }: Props) {
  const { c } = useTheme();
  const fg = variant === 'primary' ? c.onInk : variant === 'danger' ? c.damaged : c.ink;
  const glass = isLiquidGlassAvailable() && variant !== 'tertiary';
  const flat = {
    backgroundColor: variant === 'primary' ? c.ink : variant === 'tertiary' ? 'transparent' : c.paper,
    borderColor: variant === 'secondary' ? c.ink : variant === 'danger' ? c.damaged : 'transparent',
  };
  const content = (
    <>
      {busy && <ActivityIndicator color={fg} />}
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
      {trailing != null && <Text style={[styles.trailing, { color: fg }]}>{trailing}</Text>}
    </>
  );
  const body = [styles.body, trailing != null && styles.spread];
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={a11y ?? label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => [pressed && styles.pressed, disabled && styles.disabled, style]}
    >
      {glass ? (
        <GlassView
          glassEffectStyle="regular"
          tintColor={variant === 'primary' ? c.ink : undefined}
          isInteractive
          style={[body, styles.glass]}
        >
          {content}
        </GlassView>
      ) : (
        <View style={[body, styles.flat, flat]}>{content}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    minHeight: 52,
    borderRadius: radius.capsule,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  spread: { justifyContent: 'space-between' },
  glass: { overflow: 'hidden' },
  flat: { borderWidth: 1.5 },
  label: { fontSize: 17, fontWeight: '600' },
  trailing: { fontSize: 15, opacity: 0.7 },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.9 },
  disabled: { opacity: 0.38 },
});
