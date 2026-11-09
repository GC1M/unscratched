import { render, screen } from '@testing-library/react-native';

import Settings from '../app/settings';

jest.mock('expo-router', () => jest.requireActual('@/test/expoRouter').mockExpoRouter());
jest.mock('@/db/client', () => ({ getDb: jest.fn() }));

test('shows the "Not legal advice" disclaimer', async () => {
  await render(<Settings />);
  expect(screen.getByText('Not legal advice')).toBeOnTheScreen();
  expect(screen.getByText('Reports document condition. They are not a legal opinion.')).toBeOnTheScreen();
});
