import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { useT } from '@/i18n/context';
import { serif, useTheme } from '@/theme';

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Spinner for a screen body that is still loading. */
export function Loading() {
  const { c } = useTheme();
  const { t } = useT();
  return <ActivityIndicator accessibilityLabel={t('common.loading')} color={c.ink60} style={styles.loading} />;
}

/** Full-body message for a screen that could not load (or whose record is gone), with an optional retry. */
export function Problem({ title, body, onRetry }: { title: string; body: string; onRetry?: () => void }) {
  const { c } = useTheme();
  const { t } = useT();
  return (
    <View style={styles.problem} accessibilityRole="alert">
      <Text accessibilityRole="header" style={[styles.title, { color: c.ink }]}>
        {title}
      </Text>
      <Text style={[styles.body, { color: c.ink60 }]}>{body}</Text>
      {onRetry && <Button label={t('common.tryAgain')} variant="secondary" onPress={onRetry} style={styles.retry} />}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: 48 },
  problem: { paddingTop: 48, paddingHorizontal: 4, gap: 8 },
  title: { fontFamily: serif, fontSize: 26 },
  body: { fontSize: 15, lineHeight: 22 },
  retry: { marginTop: 16 },
});
