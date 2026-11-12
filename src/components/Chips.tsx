import { Pressable, StyleSheet, Text, View } from 'react-native';

import { radius, useTheme } from '@/theme';

/** Wrapping row of pill toggles. Single choice (radio) unless `multi` is set (checkboxes). */
export function Chips<V extends string>({
  options,
  selected,
  onToggle,
  multi,
  a11y,
}: {
  options: { value: V; label: string }[];
  selected: V[];
  onToggle: (value: V) => void;
  multi?: boolean;
  a11y?: string;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole={multi ? undefined : 'radiogroup'} accessibilityLabel={a11y}>
      {options.map(({ value, label }) => {
        const on = selected.includes(value);
        return (
          <Pressable
            key={value}
            accessibilityRole={multi ? 'checkbox' : 'radio'}
            accessibilityState={multi ? { checked: on } : { selected: on }}
            accessibilityLabel={label}
            onPress={() => onToggle(value)}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: on ? c.ink : c.hair, backgroundColor: on ? c.paper : 'transparent' },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.text, { color: on ? c.ink : c.ink60 }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.capsule, borderWidth: 1.5, justifyContent: 'center' },
  text: { fontSize: 15, fontWeight: '500' },
});
