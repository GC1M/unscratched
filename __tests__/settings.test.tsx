import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import Settings from '../app/settings';
import { getDb } from '@/db/client';
import { getSetting, setSetting } from '@/db/repo';

jest.mock('expo-router', () => jest.requireActual('@/test/expoRouter').mockExpoRouter());
jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo', () => ({ getSetting: jest.fn(async () => null), setSetting: jest.fn(async () => {}) }));

test('shows the "Not legal advice" disclaimer', async () => {
  await render(<Settings />);
  expect(screen.getByText('Not legal advice')).toBeOnTheScreen();
  expect(screen.getByText('Reports document condition. They are not a legal opinion.')).toBeOnTheScreen();
});

test('note suggestions are off by default and the toggle saves the setting', async () => {
  const db = {};
  jest.mocked(getDb).mockResolvedValue(db as never);
  await render(<Settings />);
  const toggle = screen.getByLabelText('Suggest notes from photos');
  await waitFor(() => expect(getSetting).toHaveBeenCalledWith(db, 'suggest_notes'));
  expect(toggle.props.value).toBe(false);
  expect(screen.getByText(/The photo is not stored/)).toBeOnTheScreen();

  await fireEvent(toggle, 'valueChange', true);
  expect(screen.getByLabelText('Suggest notes from photos').props.value).toBe(true);
  await waitFor(() => expect(setSetting).toHaveBeenCalledWith(db, 'suggest_notes', '1'));
});
