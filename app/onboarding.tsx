import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { useOnboarding } from '@/onboarding';
import { serif, useTheme } from '@/theme';

const PAGES = [
  {
    title: '26% of renters lose a deposit',
    body: 'Most disputes come down to one question: was that scratch there when you moved in? Without proof, it is your word against the landlord’s.',
  },
  {
    title: 'Walk through, room by room',
    body: 'Mark each item good, fair, or damaged and take a photo. Unscratched turns it into a dated report you can send on move-in day and compare at move-out.',
  },
  {
    title: 'Your data stays on your phone',
    body: 'No account, no uploads. Photos and reports live on this device. Back up with iCloud.',
  },
];

export default function Onboarding() {
  const { c } = useTheme();
  const { finish } = useOnboarding();
  const [step, setStep] = useState(0);
  const page = PAGES[step];
  const last = step === PAGES.length - 1;
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: c.plaster }]}>
      <View style={styles.top}>
        <Button label="Skip" variant="tertiary" onPress={finish} testID="onboarding-skip" />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: c.ink }]} accessibilityRole="header">
          {page.title}
        </Text>
        <Text style={[styles.text, { color: c.ink60 }]}>{page.body}</Text>
      </View>
      <View style={styles.dots} accessibilityLabel={`Page ${step + 1} of ${PAGES.length}`}>
        {PAGES.map((p, idx) => (
          <View key={p.title} style={[styles.dot, { backgroundColor: idx === step ? c.ink : c.ink30 }]} />
        ))}
      </View>
      <Button label={last ? 'Get started' : 'Next'} onPress={last ? finish : () => setStep(step + 1)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
  top: { minHeight: 52, alignItems: 'flex-end' },
  body: { flex: 1, justifyContent: 'center', gap: 16 },
  title: { fontFamily: serif, fontSize: 34, lineHeight: 40 },
  text: { fontSize: 17, lineHeight: 24 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
