import { StyleSheet, Text, View } from 'react-native';

import { useT } from '@/i18n/context';
import { shortDate } from '@/lib/format';
import { radius, useTheme } from '@/theme';

/** Shown on read-only screens of a finished inspection. */
export function FinishedBanner({ finishedAt }: { finishedAt: number }) {
  const { c } = useTheme();
  const { t, locale } = useT();
  return (
    <View style={[styles.banner, { backgroundColor: c.paper }]}>
      <Text style={[styles.text, { color: c.ink }]}>{t('common.finishedBanner', { date: shortDate(finishedAt, locale) })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.tile, padding: 14, marginBottom: 12 },
  text: { fontSize: 15, fontWeight: '600' },
});
