import { Newsreader_400Regular, Newsreader_400Regular_Italic, useFonts } from '@expo-google-fonts/newsreader';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { serif, ThemeProvider, useTheme } from '@/theme';

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
          headerLargeTitleStyle: { fontFamily: serif, fontSize: 34, color: c.ink },
          headerTitleStyle: { color: c.ink },
          contentStyle: { backgroundColor: c.plaster },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'Unscratched', headerLargeTitleStyle: { fontSize: 34, color: c.ink } }} />
      </Stack>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({ Newsreader_400Regular, Newsreader_400Regular_Italic });
  if (!loaded && !error) return null;
  return (
    <ThemeProvider>
      <Navigator />
    </ThemeProvider>
  );
}
