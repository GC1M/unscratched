import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getDb } from '@/db/client';
import { syncReceipts } from '@/receipts/queue';

const sync = () => getDb().then(syncReceipts).catch(() => {});

export default function RootLayout() {
  // Retry pending receipts on start and whenever the app returns to the foreground.
  useEffect(() => {
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      <Stack screenOptions={{ headerTransparent: false }}>
        <Stack.Screen name="index" options={{ title: 'Unscratched' }} />
      </Stack>
      <StatusBar style="dark" />
    </>
  );
}
