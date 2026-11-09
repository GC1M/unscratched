import { Newsreader_400Regular, Newsreader_400Regular_Italic, useFonts } from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getDb } from '@/db/client';
import { syncReceipts } from '@/receipts/queue';
import { serif, ThemeProvider, useTheme } from '@/theme';

const sync = () => getDb().then(syncReceipts).catch(() => {});

function Navigator() {
  const { c, scheme } = useTheme();
  return (
    <>
      <Stack
        screenOptions={{
          headerLargeTitle: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerTintColor: c.ink,
          headerBackButtonDisplayMode: 'minimal',
          // Info.plist opts into view-controller based status bar appearance, so the stack owns the style.
          statusBarStyle: scheme === 'dark' ? 'light' : 'dark',
          headerLargeTitleStyle: { fontFamily: serif, fontSize: 34, color: c.ink },
          headerTitleStyle: { color: c.ink },
          contentStyle: { backgroundColor: c.plaster },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Unscratched', headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Newsreader_400Regular, Newsreader_400Regular_Italic });
  // Retry pending receipts on start and whenever the app returns to the foreground.
  useEffect(() => {
    sync();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => sub.remove();
  }, []);
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider>
      <Navigator />
    </ThemeProvider>
  );
}
