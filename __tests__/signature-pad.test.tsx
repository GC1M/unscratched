import { fireEvent, render, screen } from '@testing-library/react-native';

import { SignaturePad } from '@/components/SignaturePad';

// theme.tsx reads the saved appearance through the db client; the pad only needs the default palette.
jest.mock('@/db/client', () => ({ getDb: () => new Promise(() => {}) }));

// PanResponder reads its gesture state from touchHistory, so each event carries a one-finger history at the point.
// It ignores a move whose timestamp it has already seen, hence the clock.
let now = 0;
const touch = (x: number, y: number) => {
  now += 16;
  const record = { touchActive: true, startPageX: x, startPageY: y, startTimeStamp: now, currentPageX: x, currentPageY: y, currentTimeStamp: now, previousPageX: x, previousPageY: y, previousTimeStamp: now };
  return {
    nativeEvent: { locationX: x, locationY: y, pageX: x, pageY: y, touches: [], changedTouches: [], identifier: 0, target: 0, timestamp: now },
    touchHistory: { touchBank: [record], numberActiveTouches: 1, indexOfSingleActiveTouch: 0, mostRecentTimeStamp: now },
  };
};

test('drawing then Done hands normalized path data to onDone; Clear hands null', async () => {
  const onDone = jest.fn();
  await render(<SignaturePad onDone={onDone} />);
  const pad = screen.getByLabelText('Tenant signature pad');
  await fireEvent(pad, 'layout', { nativeEvent: { layout: { width: 600, height: 200, x: 0, y: 0 } } });
  await fireEvent(pad, 'responderGrant', touch(60, 20));
  await fireEvent(pad, 'responderMove', touch(120, 40));
  await fireEvent.press(screen.getByLabelText('Done signing'));
  expect(onDone).toHaveBeenLastCalledWith('M30 10L60 20');
  await fireEvent.press(screen.getByLabelText('Clear signature'));
  expect(onDone).toHaveBeenLastCalledWith(null);
});

test('reports drawing while a finger is down and keeps the lift-off point', async () => {
  const onDone = jest.fn();
  const onDrawing = jest.fn();
  await render(<SignaturePad onDone={onDone} onDrawing={onDrawing} />);
  const pad = screen.getByLabelText('Tenant signature pad');
  await fireEvent(pad, 'layout', { nativeEvent: { layout: { width: 600, height: 200, x: 0, y: 0 } } });
  await fireEvent(pad, 'responderGrant', touch(60, 20));
  expect(onDrawing).toHaveBeenLastCalledWith(true);
  await fireEvent(pad, 'responderRelease', touch(180, 60));
  expect(onDrawing).toHaveBeenLastCalledWith(false);
  await fireEvent.press(screen.getByLabelText('Done signing'));
  expect(onDone).toHaveBeenLastCalledWith('M30 10L90 30');
});
