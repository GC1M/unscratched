import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ItemScreen from '../app/item/[id]';
import { getItem, listPhotos, setCondition, setNote } from '@/db/repo';
import type { Item, Photo } from '@/db/types';

const db = {};
const mockPush = jest.fn();

jest.mock('@/db/client', () => ({ getDb: jest.fn(() => Promise.resolve(db)) }));
jest.mock('@/db/repo', () => ({
  getItem: jest.fn(),
  listPhotos: jest.fn(),
  setCondition: jest.fn(() => Promise.resolve()),
  setNote: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: '7' }),
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (cb: () => void | (() => void)) => require('react').useEffect(cb, [cb]),
}));

const item: Item = { id: 7, room_id: 1, name: 'Walls', condition: null, note: null, sort: 0 };
const photo = (id: number): Photo => ({
  id,
  item_id: 7,
  file_uri: `file:///p${id}.jpg`,
  sha256: 'x',
  captured_at: id,
  width: 1,
  height: 1,
  source: 'camera',
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getItem).mockResolvedValue(item);
  jest.mocked(listPhotos).mockResolvedValue([]);
});

test('tapping a chip selects it and saves; tapping again clears it', async () => {
  await render(<ItemScreen />);
  const fair = await screen.findByRole('radio', { name: 'Fair' });
  expect(fair).not.toBeSelected();

  await fireEvent.press(fair);
  expect(screen.getByRole('radio', { name: 'Fair' })).toBeSelected();
  expect(setCondition).toHaveBeenLastCalledWith(db, 7, 'fair');

  await fireEvent.press(screen.getByRole('radio', { name: 'Fair' }));
  expect(screen.getByRole('radio', { name: 'Fair' })).not.toBeSelected();
  expect(setCondition).toHaveBeenLastCalledWith(db, 7, null);
});

test('note is saved on blur', async () => {
  await render(<ItemScreen />);
  await waitFor(() => expect(getItem).toHaveBeenCalled());
  const input = screen.getByLabelText('Note');
  await fireEvent.changeText(input, 'Scuff by door');
  await fireEvent(input, 'blur');
  await waitFor(() => expect(setNote).toHaveBeenCalledWith(db, 7, 'Scuff by door'));
});

test('empty note saves null', async () => {
  await render(<ItemScreen />);
  await waitFor(() => expect(getItem).toHaveBeenCalled());
  await fireEvent(screen.getByLabelText('Note'), 'blur');
  await waitFor(() => expect(setNote).toHaveBeenCalledWith(db, 7, null));
});

test('renders photos and Add photo navigates to the camera', async () => {
  jest.mocked(listPhotos).mockResolvedValue([photo(1), photo(2)]);
  await render(<ItemScreen />);
  expect(await screen.findByLabelText('Photo 1')).toBeOnTheScreen();
  expect(screen.getByLabelText('Photo 2')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Add photo' }));
  expect(mockPush).toHaveBeenCalledWith('/camera/7');
});
