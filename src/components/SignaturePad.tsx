import { useState } from 'react';
import { PanResponder, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';

import { Button } from '@/components/Button';
import { useT } from '@/i18n/context';
import { SIGNATURE_HEIGHT, SIGNATURE_WIDTH, strokesToPath, type Stroke } from '@/report/signature';
import { radius, useTheme } from '@/theme';

const THICKNESS = 3;
// Points closer than this to the previous one are dropped, so a slow stroke doesn't mount a View per pixel.
const MIN_STEP = 2;

const at = (e: GestureResponderEvent) => ({ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });

/**
 * Finger-drawn signature. Each segment is a rotated View, so no drawing library is needed. Done hands the strokes to
 * onDone as SVG path data (see strokesToPath); Clear wipes them and hands null.
 */
export function SignaturePad({ onDone }: { onDone: (path: string | null) => void }) {
  const { c } = useTheme();
  const { t } = useT();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [done, setDone] = useState(false);
  const [width, setWidth] = useState(0);
  const height = (width * SIGNATURE_HEIGHT) / SIGNATURE_WIDTH;

  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // Keep the gesture while drawing instead of letting the screen's ScrollView take it.
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        setDone(false);
        setStrokes((s) => [...s, [at(e)]]);
      },
      onPanResponderMove: (e) => {
        const p = at(e);
        setStrokes((s) => {
          const last = s[s.length - 1];
          const prev = last[last.length - 1];
          if (Math.hypot(p.x - prev.x, p.y - prev.y) < MIN_STEP) return s;
          return [...s.slice(0, -1), [...last, p]];
        });
      },
    }),
  );

  const segments = strokes.flatMap((stroke, i) =>
    stroke.map((a, j) => {
      const b = stroke[j + 1] ?? a; // a lone point draws as a dot
      const len = Math.hypot(b.x - a.x, b.y - a.y) + THICKNESS;
      return (
        <View
          key={`${i}-${j}`}
          style={[
            styles.segment,
            {
              backgroundColor: c.ink,
              width: len,
              left: (a.x + b.x) / 2 - len / 2,
              top: (a.y + b.y) / 2 - THICKNESS / 2,
              transform: [{ rotate: `${Math.atan2(b.y - a.y, b.x - a.x)}rad` }],
            },
          ]}
        />
      );
    }),
  );

  return (
    <View>
      <View
        {...responder.panHandlers}
        accessible
        accessibilityLabel={t('signature.pad')}
        accessibilityHint={t('signature.hint')}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={[styles.pad, { height, backgroundColor: c.paper, borderColor: c.ink60 }]}
      >
        {/* pointerEvents none keeps the touch target on the pad, so locationX/Y stay in pad coordinates. */}
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {segments}
        </View>
      </View>
      {strokes.length > 0 && (
        <Text style={[styles.hint, { color: c.ink60 }]}>{t(done ? 'signature.added' : 'signature.tapDone')}</Text>
      )}
      <View style={styles.actions}>
        <Button
          label={t('signature.clear')}
          a11y={t('signature.clearA11y')}
          variant="secondary"
          style={styles.action}
          disabled={!strokes.length}
          onPress={() => {
            setStrokes([]);
            setDone(false);
            onDone(null);
          }}
        />
        <Button
          label={t('common.done')}
          a11y={t('signature.doneA11y')}
          variant="secondary"
          style={styles.action}
          disabled={!strokes.length || done}
          onPress={() => {
            setDone(true);
            onDone(strokesToPath(strokes, width, height));
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { borderRadius: radius.tile, borderBottomWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  segment: { position: 'absolute', height: THICKNESS, borderRadius: THICKNESS / 2 },
  hint: { fontSize: 15, marginTop: 6, marginHorizontal: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  action: { flex: 1 },
});
