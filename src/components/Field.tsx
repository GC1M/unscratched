import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { radius, serifItalic, useTheme } from '@/theme';

/** Paper capsule text field. `signature` sets it as an italic serif on a ruled baseline. */
export function Field({ signature, style, ...props }: TextInputProps & { signature?: boolean }) {
  const { c } = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.ink60}
      {...props}
      style={[
        signature ? [styles.signature, { borderColor: c.ink60 }] : [styles.field, { backgroundColor: c.paper }],
        { color: c.ink },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 52, borderRadius: radius.capsule, paddingHorizontal: 18, fontSize: 17 },
  signature: { minHeight: 52, paddingHorizontal: 4, fontSize: 24, fontFamily: serifItalic, borderBottomWidth: StyleSheet.hairlineWidth },
});
