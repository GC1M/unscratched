import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useT } from '@/i18n/context';
import { useOnboarding } from '@/onboarding';
import { serif, useTheme } from '@/theme';

const PAGES = [1, 2, 3] as const;

export default function Onboarding() {
  const { c } = useTheme();
  const { t } = useT();
  const { finish } = useOnboarding();
  const [step, setStep] = useState(0);
  const page = PAGES[step];
  const last = step === PAGES.length - 1;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.plaster }]}>
      <View style={styles.top}>
        <Button label={t('onboarding.skip')} variant="tertiary" onPress={finish} testID="onboarding-skip" />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">
          {t(`onboarding.${page}.title`)}
        </Text>
        <Text style={[styles.text, { color: c.ink60 }]}>{t(`onboarding.${page}.body`)}</Text>
      </ScrollView>
      <View style={styles.dots} accessible accessibilityLabel={t('onboarding.page', { n: step + 1, total: PAGES.length })}>
        {PAGES.map((p, idx) => (
          <View key={p} style={[styles.dot, { backgroundColor: idx === step ? c.ink : c.ink30 }]} />
        ))}
      </View>
      <Button label={t(last ? 'onboarding.start' : 'onboarding.next')} onPress={last ? finish : () => setStep(step + 1)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  top: { minHeight: 52, alignItems: 'flex-end' },
  body: { flexGrow: 1, justifyContent: 'center', gap: 16, paddingVertical: 16 },
  title: { fontFamily: serif, fontSize: 34, lineHeight: 40 },
  text: { fontSize: 17, lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
