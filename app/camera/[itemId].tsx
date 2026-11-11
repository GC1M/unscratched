import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { Problem, errorMessage } from '@/components/Status';
import { getDb } from '@/db/client';
import { getFinishedAt, getItem } from '@/db/repo';
import { useT } from '@/i18n/context';
import { capturePhoto } from '@/lib/photos';
import { useTheme } from '@/theme';

export default function CameraScreen() {
  const { c } = useTheme();
  const { t } = useT();
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [saving, setSaving] = useState(false);
  // A missing item or a finished inspection (e.g. reached by a crafted deep link) gets a message, not a shutter.
  const [checked, setChecked] = useState(false);
  const [refusal, setRefusal] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    (async () => {
      const db = await getDb();
      const id = Number(itemId);
      const [item, finishedAt] = await Promise.all([getItem(db, id), getFinishedAt(db, 'item', id)]);
      if (!item) setRefusal({ title: t('common.itemNotFound'), body: t('common.mayBeDeleted') });
      else if (finishedAt != null) setRefusal({ title: t('camera.finishedTitle'), body: t('camera.finishedBody') });
      setChecked(true);
    })().catch((e: unknown) => setRefusal({ title: t('camera.openError'), body: errorMessage(e) }));
  }, [itemId, t]);

  async function onShutter() {
    if (!camera.current || saving) return;
    setSaving(true);
    try {
      const picture = await camera.current.takePictureAsync({ quality: 1 });
      await capturePhoto(await getDb(), Number(itemId), picture.uri);
      router.back();
    } catch (e) {
      setSaving(false);
      Alert.alert(t('camera.saveError'), e instanceof Error ? e.message : String(e));
    }
  }

  let body;
  if (refusal) {
    body = (
      <View style={[styles.center, styles.message, { backgroundColor: c.plaster }]}>
        <Problem title={refusal.title} body={refusal.body} />
      </View>
    );
  } else if (!permission || !checked) {
    body = <ActivityIndicator style={[styles.center, { backgroundColor: c.plaster }]} />;
  } else if (!permission.granted) {
    const canAsk = permission.canAskAgain;
    body = (
      <View style={[styles.center, styles.message, { backgroundColor: c.plaster }]}>
        <Text style={[styles.text, { color: c.ink }]}>
          {t('camera.why')}
          {canAsk ? '' : t('camera.off')}
        </Text>
        <Button label={t(canAsk ? 'camera.allow' : 'camera.openSettings')} onPress={canAsk ? requestPermission : () => Linking.openSettings()} />
      </View>
    );
  } else {
    body = (
      <View style={styles.camera}>
        <CameraView ref={camera} facing="back" style={StyleSheet.absoluteFill} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('camera.take')}
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
      <Stack.Screen options={{ title: t('camera.take'), headerLargeTitle: false, headerTransparent: true, headerTintColor: '#fff' }} />
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
