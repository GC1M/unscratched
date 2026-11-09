import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { getDb } from '@/db/client';
import { capturePhoto } from '@/lib/photos';
import { useTheme } from '@/theme';

export default function CameraScreen() {
  const { c } = useTheme();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [saving, setSaving] = useState(false);

  async function onShutter() {
    if (!camera.current || saving) return;
    setSaving(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1 });
      await capturePhoto(await getDb(), Number(itemId), picture.uri);
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert('Could not save photo', e instanceof Error ? e.message : String(e));
    }
  }

  let body;
  if (!permission) {
    body = <ActivityIndicator style={[styles.center, { backgroundColor: c.plaster }]} />;
  } else if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    body = (
      <View style={[styles.center, styles.message, { backgroundColor: c.plaster }]}>
        <Text style={[styles.text, { color: c.ink }]}>
          Unscratched needs the camera to photograph your rental&apos;s condition. Photos are taken in the app so
          they can be trusted.
          {canAsk ? '' : ' Camera access is turned off. Turn it on in Settings.'}
        </Text>
        <Button label={canAsk ? 'Allow camera' : 'Open Settings'} onPress={canAsk ? requestPermission : () => Linking.openSettings()} />
      </View>
    );
  } else {
    body = (
      <View style={styles.camera}>
        <CameraView ref={camera} facing="back" style={StyleSheet.absoluteFill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={onShutter}
          style={[styles.shutter, saving && styles.shutterDisabled]}
        >
          {saving && <ActivityIndicator />}
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Take photo', headerLargeTitle: false, headerTransparent: true, headerTintColor: '#fff' }} />
      {body}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  message: { padding: 24, gap: 24 },
  text: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  camera: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end', alignItems: 'center' },
  shutter: {
    width: 80,
    height: 80,
    marginBottom: 40,
    borderRadius: 40,
    borderWidth: 6,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterDisabled: { opacity: 0.5 },
});
