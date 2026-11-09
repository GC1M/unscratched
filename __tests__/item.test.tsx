import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import ItemScreen from '../app/item/[id]';
import { getFinishedAt, getItem, getRoom, listItems, listPhotos, setCondition, setNote } from '@/db/repo';
import type { Item, Photo } from '@/db/types';
import { findMoveInItem } from '@/lib/moveInMatch';
import { shortDate } from '@/lib/format';

const db = {};

jest.mock('@/db/client', () => ({ getDb: jest.fn(() => Promise.resolve(db)) }));
jest.mock('@/db/repo', () => ({
  getFinishedAt: jest.fn(),
  getItem: jest.fn(),
  getRoom: jest.fn(),
  listItems: jest.fn(),
  listPhotos: jest.fn(),
  setCondition: jest.fn(() => Promise.resolve()),
  setNote: jest.fn(() => Promise.resolve()),
}));
jest.mock('@/lib/moveInMatch', () => ({ findMoveInItem: jest.fn() }));
jest.mock('expo-router', () => require('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '7' }) }));

const item: Item = { id: 7, room_id: 1, name: 'Walls', condition: null, note: null, sort: 0 };
const floor: Item = { id: 8, room_id: 1, name: 'Floor', condition: null, note: null, sort: 1 };
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
  jest.mocked(getRoom).mockResolvedValue({ id: 1, inspection_id: 1, name: 'Kitchen', sort: 0 });
  jest.mocked(listItems).mockResolvedValue([item, floor]);
  jest.mocked(listPhotos).mockResolvedValue([]);
  jest.mocked(getFinishedAt).mockResolvedValue(null);
  jest.mocked(findMoveInItem).mockResolvedValue(null);
});

test('tapping a condition selects it and saves; tapping again clears it', async () => {
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

test('shows position in the room and Next goes to the next unchecked item', async () => {
  await render(<ItemScreen />);
  expect(await screen.findByText('Kitchen, item 1 of 2')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Next: Floor' }));
  expect(router.replace).toHaveBeenCalledWith('/item/8');
});

test('when nothing is left, Done goes back to the room', async () => {
  jest.mocked(listItems).mockResolvedValue([item, { ...floor, condition: 'good' }]);
  await render(<ItemScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Done with Kitchen' }));
  expect(router.back).toHaveBeenCalled();
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
  expect(router.push).toHaveBeenCalledWith('/camera/7');
});

test('finished inspection: conditions read-only, note not editable, Add photo and Next hidden, banner shown', async () => {
  jest.mocked(getFinishedAt).mockResolvedValue(5);
  jest.mocked(getItem).mockResolvedValue({ ...item, condition: 'good', note: 'Clean' });
  jest.mocked(listPhotos).mockResolvedValue([photo(1)]);
  await render(<ItemScreen />);
  expect(await screen.findByText(`Finished ${shortDate(5)}. Locked so the report can be trusted.`)).toBeOnTheScreen();
  expect(getFinishedAt).toHaveBeenCalledWith(db, 'item', 7);

  const fair = screen.getByRole('radio', { name: 'Fair' });
  expect(fair).toBeDisabled();
  await fireEvent.press(fair);
  expect(screen.getByRole('radio', { name: 'Good' })).toBeSelected();
  expect(setCondition).not.toHaveBeenCalled();

  const note = screen.getByLabelText('Note');
  expect(note.props.editable).toBe(false);
  await fireEvent(note, 'blur');
  expect(setNote).not.toHaveBeenCalled();

  expect(screen.getByLabelText('Photo 1')).toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: 'Add photo' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next: Floor' })).toBeNull();
});

describe('move-in peek', () => {
  const moveInItem: Item = { ...item, id: 3, room_id: 9 };

  test('button hidden when there is no move-in match (move-in item or unmatched move-out)', async () => {
    await render(<ItemScreen />);
    await waitFor(() => expect(findMoveInItem).toHaveBeenCalledWith(db, 7));
    expect(screen.queryByRole('button', { name: 'View move-in photo' })).toBeNull();
  });

  test('button visible for a matched move-out item and opens the move-in photos', async () => {
    jest.mocked(findMoveInItem).mockResolvedValue(moveInItem);
    jest.mocked(listPhotos).mockImplementation(async (_db, id) => (id === 3 ? [photo(10), photo(11)] : []));
    await render(<ItemScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'View move-in photo' }));
    expect(listPhotos).toHaveBeenCalledWith(db, 3);
    expect(screen.getByLabelText('Move-in photo 1 of 2')).toBeOnTheScreen();
    expect(screen.getByLabelText('Move-in photo 2 of 2')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByLabelText('Move-in photo 1 of 2')).toBeNull();
  });

  test('matched item without photos says so', async () => {
    jest.mocked(findMoveInItem).mockResolvedValue(moveInItem);
    await render(<ItemScreen />);
    await fireEvent.press(await screen.findByRole('button', { name: 'View move-in photo' }));
    expect(screen.getByText('No move-in photo for this item')).toBeOnTheScreen();
  });
});
