import { fireEvent, render, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { Linking } from 'react-native';

import CameraScreen from '../app/camera/[itemId]';

const mockRequest = jest.fn();

jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: jest.fn() }));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ itemId: '7' }),
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock('@/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@/lib/photos', () => ({ capturePhoto: jest.fn() }));

function permission(granted: boolean, canAskAgain: boolean) {
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([{ granted, canAskAgain } as never, mockRequest, jest.fn()]);
}

beforeEach(() => jest.clearAllMocks());

test('permanently denied shows Open Settings, which opens app settings', async () => {
  permission(false, false);
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<CameraScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
  expect(openSettings).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Allow camera' })).toBeNull();
});

test('not granted but can ask again shows Allow camera, which requests permission', async () => {
  permission(false, true);
  await render(<CameraScreen />);

  await fireEvent.press(screen.getByRole('button', { name: 'Allow camera' }));
  expect(mockRequest).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
});

test('granted shows the shutter button', async () => {
  permission(true, true);
  await render(<CameraScreen />);
  expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
});
