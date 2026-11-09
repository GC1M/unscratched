import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/Button';
import { useTheme } from '@/theme';

interface Props {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  placeholder?: string;
  a11y: string;
  submitLabel?: string;
}

/** A row-sized text input with Save and Cancel, used for inline add and rename. */
export function InlineInput({ value, onChangeText, onSubmit, onCancel, placeholder, a11y, submitLabel = 'Save' }: Props) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.input, { color: c.ink, borderColor: c.ink }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.ink60}
        accessibilityLabel={a11y}
        onSubmitEditing={onSubmit}
        autoFocus
      />
      <Button label={submitLabel} variant="tertiary" onPress={onSubmit} />
      <Button label="Cancel" variant="tertiary" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', minHeight: 58, paddingLeft: 16, paddingRight: 4 },
  input: { flexGrow: 1, flexBasis: 120, fontSize: 17, borderBottomWidth: 1, paddingVertical: 8 },
});
