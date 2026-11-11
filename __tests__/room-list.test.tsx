import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import { cancelReminders } from '@/lib/scheduleReminders';
import type { Item, Room } from '@/db/types';
import { shortDate } from '@/lib/format';

import RoomList from '../app/inspection/[id]/index';

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('@/db/repo');
jest.mock('@/report/exportComparison', () => ({ exportComparison: jest.fn(), exportDisputeLetter: jest.fn() }));
jest.mock('@/lib/scheduleReminders', () => ({ cancelReminders: jest.fn(async () => {}) }));
jest.mock('expo-router', () => jest.requireActual('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '1' }) }));

const r = jest.mocked(repo);
let rooms: Room[];
let items: Item[];

beforeEach(() => {
  jest.clearAllMocks();
  rooms = [
    { id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 },
    { id: 11, inspection_id: 1, name: 'Bath', sort: 1 },
  ];
  items = [
    { id: 1, room_id: 10, name: 'Walls', condition: 'good', note: null, sort: 0 },
    { id: 2, room_id: 10, name: 'Floor', condition: null, note: null, sort: 1 },
  ];
  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: null } as never);
  r.listRooms.mockImplementation(async () => rooms);
  r.listInspectionItems.mockImplementation(async () => items);
});

test('lists rooms with item counts and overall item progress', async () => {
  await render(<RoomList />);
  expect(await screen.findByText('Kitchen')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2')).toBeOnTheScreen();
  expect(screen.getByText('0 of 0')).toBeOnTheScreen();
  expect(screen.getByText('1 of 2 items, 0 of 2 rooms')).toBeOnTheScreen();
  expect(r.listInspectionItems).toHaveBeenCalledWith({}, 1);
  expect(r.listItems).not.toHaveBeenCalled();
});

test('Continue opens the first room with work left; Finish only shows once every room is done', async () => {
  const { router } = jest.requireMock('expo-router');
  await render(<RoomList />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Continue with Kitchen' }));
  expect(router.push).toHaveBeenCalledWith('/inspection/1/room/10');
  expect(screen.queryByRole('button', { name: 'Finish inspection' })).toBeNull();

  items = [
    { ...items[0] },
    { ...items[1], condition: 'fair' },
    { id: 3, room_id: 11, name: 'Tub', condition: 'damaged', note: null, sort: 0 },
  ];
  await render(<RoomList />);
  expect(await screen.findByRole('button', { name: 'Finish inspection' })).toBeOnTheScreen();
});

test('shows fair and damaged tallies per room', async () => {
  items = [
    { ...items[0], condition: 'fair' },
    { ...items[1], condition: 'damaged' },
    { id: 3, room_id: 11, name: 'Tub', condition: 'damaged', note: null, sort: 0 },
  ];
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.getAllByText('1')).toHaveLength(3);
  expect(screen.getByRole('button', { name: 'Open Kitchen, 2 of 2 items, 1 fair, 1 damaged' })).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Open Bath, 1 of 1 items, 1 damaged' })).toBeOnTheScreen();
});

test('adding a room shows it in the list', async () => {
  r.addRoom.mockImplementation(async (_db, _insp, name) => {
    rooms = [...rooms, { id: 12, inspection_id: 1, name, sort: 2 }];
    return 12;
  });
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.press(screen.getByLabelText('Add room'));
  await fireEvent.changeText(screen.getByLabelText('New room name'), 'Hall');
  await fireEvent.press(screen.getByLabelText('Add'));
  expect(r.addRoom).toHaveBeenCalledWith({}, 1, 'Hall');
  expect(await screen.findByText('Hall')).toBeOnTheScreen();
});

test('Edit mode: delete asks for confirmation, Up and Down reorder, tapping a name renames', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'destructive')?.onPress?.();
  });
  r.deleteRoom.mockImplementation(async (_db, id) => {
    rooms = rooms.filter((x) => x.id !== id);
  });
  await render(<RoomList />);
  await screen.findByText('Bath');
  expect(screen.queryByLabelText('Delete Bath')).toBeNull();
  await fireEvent.press(screen.getByLabelText('Edit rooms'));

  await fireEvent.press(screen.getByLabelText('Move Bath up'));
  expect(r.moveRoom).toHaveBeenCalledWith({}, 11, 'up');
  await fireEvent.press(screen.getByLabelText('Move Kitchen down'));
  expect(r.moveRoom).toHaveBeenCalledWith({}, 10, 'down');

  await fireEvent.press(screen.getByLabelText('Rename Kitchen'));
  await fireEvent.changeText(screen.getByLabelText('Room name'), 'Galley');
  await fireEvent.press(screen.getByLabelText('Save'));
  expect(r.renameRoom).toHaveBeenCalledWith({}, 10, 'Galley');

  await fireEvent.press(screen.getByLabelText('Delete Bath'));
  expect(alert).toHaveBeenCalled();
  expect(r.deleteRoom).toHaveBeenCalledWith({}, 11);
  expect(screen.queryByText('Bath')).toBeNull();
});

// iOS merges an accessible element's descendants into it, so a control nested in the row button is unreachable
// by VoiceOver (and by Maestro). Edit controls must be siblings of the row button.
const insideAccessible = (el: ReturnType<typeof screen.getByRole>) => {
  for (let p = el.parent; p; p = p.parent) if (p.props.accessible) return true;
  return false;
};

test('Edit mode: delete and reorder controls are not nested inside the row button, so VoiceOver can reach them', async () => {
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  await fireEvent.press(screen.getByLabelText('Edit rooms'));
  expect(insideAccessible(screen.getByRole('button', { name: 'Rename Kitchen' }))).toBe(false);
  for (const name of ['Delete Kitchen', 'Move Kitchen up', 'Move Kitchen down']) {
    expect(insideAccessible(screen.getByRole('button', { name }))).toBe(false);
  }
});

test('Finish asks for confirmation, calls finishInspection, then hides edit controls', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === 'Finish and lock')?.onPress?.();
  });
  items = [{ ...items[0] }, { ...items[1], condition: 'good' }, { id: 3, room_id: 11, name: 'Tub', condition: 'good', note: null, sort: 0 }];
  const finishedAt = new Date(2026, 0, 20).getTime();
  r.finishInspection.mockImplementation(async () => {
    r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: finishedAt } as never);
  });
  await render(<RoomList />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Finish inspection' }));
  expect(alert).toHaveBeenCalledWith('Finish this inspection?', expect.stringContaining('lock'), expect.any(Array));
  expect(r.finishInspection).toHaveBeenCalledWith({}, 1);
  expect(await screen.findByText(`Finished ${shortDate(finishedAt)}. Locked so the report can be trusted.`)).toBeOnTheScreen();
  for (const label of ['Finish inspection', 'Add room', 'Edit rooms']) {
    expect(screen.queryByLabelText(label)).toBeNull();
  }
  expect(screen.getByLabelText('Open Kitchen, 2 of 2 items')).toBeOnTheScreen();
});

test('cancelling the Finish confirmation does not finish', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.style === 'cancel')?.onPress?.();
  });
  items = [{ ...items[0] }, { ...items[1], condition: 'good' }, { id: 3, room_id: 11, name: 'Tub', condition: 'good', note: null, sort: 0 }];
  await render(<RoomList />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Finish inspection' }));
  expect(r.finishInspection).not.toHaveBeenCalled();
});

test('Export report shows only for a finished inspection and opens the export screen', async () => {
  const { router } = jest.requireMock('expo-router');
  await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.queryByLabelText('Export report')).toBeNull();

  r.getInspection.mockResolvedValue({ id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Export report'));
  expect(router.push).toHaveBeenCalledWith('/inspection/1/export');
});

const base = { id: 1, address: '1 Main St', started_at: 0 };

test('Export comparison shows only for a finished move-out linked to a move-in and exports it', async () => {
  const { exportComparison } = jest.requireMock('@/report/exportComparison');
  const cases = [
    { kind: 'move_in', finished_at: 5, linked_move_in_id: null },
    { kind: 'move_out', finished_at: null, linked_move_in_id: 3 },
    { kind: 'move_out', finished_at: 5, linked_move_in_id: null },
  ];
  for (const c of cases) {
    r.getInspection.mockResolvedValue({ ...base, ...c } as never);
    const { unmount } = await render(<RoomList />);
    await screen.findByText('Kitchen');
    expect(screen.queryByLabelText('Export comparison')).toBeNull();
    await unmount();
  }

  r.getInspection.mockResolvedValue({ ...base, kind: 'move_out', finished_at: 5, linked_move_in_id: 3 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Export comparison'));
  expect(exportComparison).toHaveBeenCalledWith({}, 1);
});

test('a failed comparison export shows an alert', async () => {
  const { exportComparison } = jest.requireMock('@/report/exportComparison');
  exportComparison.mockRejectedValueOnce(new Error('boom'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  r.getInspection.mockResolvedValue({ ...base, kind: 'move_out', finished_at: 5, linked_move_in_id: 3 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Export comparison'));
  expect(alert).toHaveBeenCalledWith('Comparison export failed', 'boom');
});

test('Dispute letter shows only next to Export comparison and exports it; a failure shows an alert', async () => {
  const { exportDisputeLetter } = jest.requireMock('@/report/exportComparison');
  r.getInspection.mockResolvedValue({ ...base, kind: 'move_out', finished_at: 5, linked_move_in_id: null } as never);
  const { unmount } = await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.queryByLabelText('Dispute letter (PDF)')).toBeNull();
  await unmount();

  r.getInspection.mockResolvedValue({ ...base, kind: 'move_out', finished_at: 5, linked_move_in_id: 3 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Dispute letter (PDF)'));
  expect(exportDisputeLetter).toHaveBeenCalledWith({}, 1);

  exportDisputeLetter.mockRejectedValueOnce(new Error('boom'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await fireEvent.press(screen.getByLabelText('Dispute letter (PDF)'));
  expect(alert).toHaveBeenCalledWith('Dispute letter export failed', 'boom');
});

test('Start move-out shows only for a finished move-in and opens the new inspection', async () => {
  const { router } = jest.requireMock('expo-router');
  r.copyFromMoveIn.mockResolvedValue(7);
  for (const insp of [
    { kind: 'move_in', finished_at: null },
    { kind: 'move_out', finished_at: 5 },
  ]) {
    r.getInspection.mockResolvedValue({ ...base, ...insp } as never);
    await render(<RoomList />);
    await screen.findByText('Kitchen');
    expect(screen.queryByLabelText('Start move-out')).toBeNull();
  }

  r.getInspection.mockResolvedValue({ ...base, kind: 'move_in', finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Start move-out'));
  expect(r.copyFromMoveIn).toHaveBeenCalledWith({}, 1);
  expect(router.push).toHaveBeenCalledWith('/inspection/7');
});

test('Start move-out failure shows an alert instead of navigating', async () => {
  const { router } = jest.requireMock('expo-router');
  router.push.mockClear();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  r.copyFromMoveIn.mockRejectedValue(new Error('Only a finished move-in can start a move-out.'));
  r.getInspection.mockResolvedValue({ ...base, kind: 'move_in', finished_at: 5 } as never);
  await render(<RoomList />);
  await fireEvent.press(await screen.findByLabelText('Start move-out'));
  expect(alert).toHaveBeenCalledWith('Could not start move-out', 'Only a finished move-in can start a move-out.');
  expect(router.push).not.toHaveBeenCalled();
});

test('Delete inspection asks first, deletes, then goes back; Cancel deletes nothing', async () => {
  const { router } = jest.requireMock('expo-router');
  let choice = 'Cancel';
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === choice)?.onPress?.();
  });
  await render(<RoomList />);
  expect(await screen.findByRole('button', { name: 'Delete inspection' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByTestId('delete-inspection'));
  expect(alert).toHaveBeenCalledWith('Delete this inspection?', expect.stringContaining('cannot be undone'), expect.any(Array));
  expect(r.deleteInspection).not.toHaveBeenCalled();
  expect(cancelReminders).not.toHaveBeenCalled();

  choice = 'Delete';
  await fireEvent.press(screen.getByTestId('delete-inspection'));
  expect(r.deleteInspection).toHaveBeenCalledWith({}, 1);
  expect(cancelReminders).toHaveBeenCalledWith(1);
  expect(router.back).toHaveBeenCalled();
});

test('a failed delete shows an alert and stays', async () => {
  const { router } = jest.requireMock('expo-router');
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === 'Delete')?.onPress?.();
  });
  r.deleteInspection.mockRejectedValue(new Error('disk full'));
  await render(<RoomList />);
  await fireEvent.press(await screen.findByTestId('delete-inspection'));
  expect(alert).toHaveBeenLastCalledWith('Could not delete inspection', 'disk full');
  expect(router.back).not.toHaveBeenCalled();
  expect(cancelReminders).not.toHaveBeenCalled();
});

test('a load failure shows the error with a retry; a missing inspection says so', async () => {
  r.listRooms.mockRejectedValueOnce(new Error('database is locked'));
  await render(<RoomList />);
  expect(await screen.findByText('Could not load this inspection')).toBeOnTheScreen();
  expect(screen.getByText('database is locked')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Kitchen')).toBeOnTheScreen();

  r.getInspection.mockResolvedValue(null);
  await render(<RoomList />);
  expect(await screen.findByText('Inspection not found')).toBeOnTheScreen();
});

test('a move-out with a known state shows the deposit deadline, due date and source; a move-in does not', async () => {
  const moveOutDate = new Date(2027, 5, 30).getTime();
  r.getInspection.mockResolvedValue({ ...base, kind: 'move_in', finished_at: null, state: 'WA', move_out_date: moveOutDate } as never);
  const { unmount } = await render(<RoomList />);
  await screen.findByText('Kitchen');
  expect(screen.queryByTestId('deposit-deadline')).toBeNull();
  await unmount();

  r.getInspection.mockResolvedValue({ ...base, kind: 'move_out', finished_at: null, state: 'WA', move_out_date: moveOutDate } as never);
  await render(<RoomList />);
  expect(
    await screen.findByText('In Washington, landlords generally have 30 days after move-out to return the deposit. Full statement and any refund are due within 30 days.'),
  ).toBeOnTheScreen();
  expect(screen.getByText(`Due around ${new Date(2027, 6, 30).toLocaleDateString()}`)).toBeOnTheScreen();
  const { Linking } = jest.requireActual('react-native');
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await fireEvent.press(screen.getByRole('link', { name: 'Source' }));
  expect(open).toHaveBeenCalledWith('https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.280');
});

test('a finished inspection shows the sent record and still saves the landlord contact; bad portal links are refused', async () => {
  const sentAt = new Date(2026, 0, 22).getTime();
  r.getInspection.mockResolvedValue({
    id: 1, address: '1 Main St', kind: 'move_in', started_at: 0, finished_at: 1,
    landlord_email: 'lee@example.com', portal_url: null, sent_at: sentAt, sent_channel: 'email',
  } as never);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<RoomList />);
  expect(await screen.findByText(`Sent to landlord on ${shortDate(sentAt)} by email`)).toBeOnTheScreen();
  expect(screen.getByText('lee@example.com')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Edit Landlord portal' }));
  await fireEvent.changeText(screen.getByLabelText('Landlord portal'), 'javascript:alert(1)');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(alert).toHaveBeenCalledWith('Check the portal link', 'Enter the full web address, starting with https://');
  expect(r.setLandlordContact).not.toHaveBeenCalled();

  await fireEvent.changeText(screen.getByLabelText('Landlord portal'), ' https://portal.example.com ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
  expect(r.setLandlordContact).toHaveBeenCalledWith({}, 1, { landlord_email: 'lee@example.com', portal_url: 'https://portal.example.com' });
});
