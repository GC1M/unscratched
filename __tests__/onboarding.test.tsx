import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import { Text } from 'react-native';

import RootLayout from '../app/_layout';
import Onboarding from '../app/onboarding';
import { getSetting, setSetting } from '@/db/repo';

jest.mock('@expo-google-fonts/newsreader', () => ({ useFonts: () => [true, null] }));
jest.mock('@/db/client', () => ({ getDb: jest.fn().mockResolvedValue({}) }));
jest.mock('@/db/repo', () => ({ getSetting: jest.fn(), setSetting: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/receipts/queue', () => ({ syncReceipts: jest.fn() }));

const routes = { _layout: RootLayout, index: () => <Text>Home screen</Text>, onboarding: Onboarding };

beforeEach(() => jest.clearAllMocks());

test('first launch shows onboarding; finishing it saves the flag and lands on home', async () => {
  jest.mocked(getSetting).mockResolvedValue(null);
  await renderRouter(routes);

  expect(await screen.findByText('26% of renters lose a deposit')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Walk through, room by room')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Next' }));
  expect(screen.getByText('Your data stays on your phone')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Get started' }));

  expect(await screen.findByText('Home screen')).toBeOnTheScreen();
  expect(setSetting).toHaveBeenCalledWith({}, 'onboarded', '1');
});

test('skip finishes onboarding from the first screen', async () => {
  jest.mocked(getSetting).mockResolvedValue(null);
  await renderRouter(routes);

  await fireEvent.press(await screen.findByTestId('onboarding-skip'));
  expect(await screen.findByText('Home screen')).toBeOnTheScreen();
  expect(setSetting).toHaveBeenCalledWith({}, 'onboarded', '1');
});

test('after completion the app opens straight to home', async () => {
  jest.mocked(getSetting).mockImplementation(async (_db, key) => (key === 'onboarded' ? '1' : null));
  await renderRouter(routes);

  expect(await screen.findByText('Home screen')).toBeOnTheScreen();
  expect(screen.queryByText('26% of renters lose a deposit')).not.toBeOnTheScreen();
});
