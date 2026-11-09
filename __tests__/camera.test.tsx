import { fireEvent, render, screen } from '@testing-library/react-native';
import { useCameraPermissions } from 'expo-camera';
import { Linking } from 'react-native';

import { getFinishedAt } from '@/db/repo';

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
jest.mock('@/db/repo', () => ({ getFinishedAt: jest.fn() }));

function permission(granted: boolean, canAskAgain: boolean) {
  jest
    .mocked(useCameraPermissions)
    .mockReturnValue([{ granted, canAskAgain } as never, mockRequest, jest.fn()]);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getFinishedAt).mockResolvedValue(null);
});

test('permanently denied shows Open Settings, which opens app settings', async () => {
  permission(false, false);
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  await render(<CameraScreen />);

  await fireEvent.press(await screen.findByRole('button', { name: 'Open Settings' }));
  expect(openSettings).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Allow camera' })).toBeNull();
});

test('not granted but can ask again shows Allow camera, which requests permission', async () => {
  permission(false, true);
  await render(<CameraScreen />);

  await fireEvent.press(await screen.findByRole('button', { name: 'Allow camera' }));
  expect(mockRequest).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Open Settings' })).toBeNull();
});

test('granted shows the shutter button', async () => {
  permission(true, true);
  await render(<CameraScreen />);
  expect(await screen.findByRole('button', { name: 'Take photo' })).toBeTruthy();
  expect(getFinishedAt).toHaveBeenCalledWith(undefined, 'item', 7);
});

test('a finished inspection shows a locked message and no shutter or permission prompt', async () => {
  permission(true, true);
  jest.mocked(getFinishedAt).mockResolvedValue(123);
  await render(<CameraScreen />);
  expect(await screen.findByText('This inspection is finished')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();

  permission(false, true);
  await render(<CameraScreen />);
  expect(await screen.findByText('This inspection is finished')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
});
