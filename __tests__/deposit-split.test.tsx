import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import * as repo from '@/db/repo';
import type { Item, Room } from '@/db/types';

import DepositSplitScreen from '../app/inspection/[id]/deposit';

const db = {};

jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => db) }));
jest.mock('@/db/repo');
jest.mock('expo-router', () => jest.requireActual('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: () => ({ id: '2' }) }));

// Move-in 1 and move-out 2: Walls and Oven got worse, Floor did not.
const rooms: Record<number, Room[]> = {
  1: [{ id: 10, inspection_id: 1, name: 'Kitchen', sort: 0 }],
  2: [{ id: 20, inspection_id: 2, name: 'Kitchen', sort: 0 }],
};
const items: Record<number, Item[]> = {
  1: [
    { id: 100, room_id: 10, name: 'Walls', condition: 'good', note: null, sort: 0 },
    { id: 101, room_id: 10, name: 'Floor', condition: 'good', note: null, sort: 1 },
    { id: 102, room_id: 10, name: 'Oven', condition: 'fair', note: null, sort: 2 },
  ],
  2: [
    { id: 200, room_id: 20, name: 'Walls', condition: 'damaged', note: null, sort: 0 },
    { id: 201, room_id: 20, name: 'Floor', condition: 'good', note: null, sort: 1 },
    { id: 202, room_id: 20, name: 'Oven', condition: 'damaged', note: null, sort: 2 },
  ],
};
const stored = {
  depositCents: 150000,
  tenants: [{ id: 1, name: 'Ana', percent: 60 }, { id: 2, name: 'Bo', percent: 40 }],
  deductions: { 200: { cents: 12050, to: 2 } },
};

function setup(moveOut: Record<string, unknown> = {}) {
  const inspections: Record<number, unknown> = {
    1: { id: 1, kind: 'move_in', linked_move_in_id: null, deposit_split: null, tenant_name: null },
    2: { id: 2, kind: 'move_out', linked_move_in_id: 1, deposit_split: JSON.stringify(stored), tenant_name: 'Ana', ...moveOut },
  };
  jest.mocked(repo.getInspection).mockImplementation(async (_db, id) => inspections[id] as never);
  jest.mocked(repo.listRooms).mockImplementation(async (_db, id) => rooms[id]);
  jest.mocked(repo.listInspectionItems).mockImplementation(async (_db, id) => items[id]);
}

const saved = () => JSON.parse(jest.mocked(repo.setDepositSplit).mock.lastCall![2]!);
const value = (label: string) => screen.getByLabelText(label).props.value;
const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save' }));

beforeEach(() => {
  jest.clearAllMocks();
  setup();
});

test('shows the stored deposit, people, shares and deductions, listing only worsened items', async () => {
  await render(<DepositSplitScreen />);
  expect(await screen.findByDisplayValue('1500.00')).toBeOnTheScreen();
  expect(value('Person 1')).toBe('Ana');
  expect(value('Share percentage for person 1')).toBe('60');
  expect(value('Person 2')).toBe('Bo');
  expect(value('Share percentage for person 2')).toBe('40');
  expect(screen.getByText('Kitchen · Walls')).toBeOnTheScreen();
  expect(screen.getByText('Kitchen · Oven')).toBeOnTheScreen();
  expect(screen.queryByText('Kitchen · Floor')).toBeNull();
  expect(value('Deduction for Walls')).toBe('120.50');
  expect(value('Deduction for Oven')).toBe('');
  // Walls is charged to Bo; Oven defaults to everyone.
  expect(screen.getAllByRole('radio', { name: 'Bo' }).map((r) => r.props.accessibilityState.selected)).toEqual([true, false]);
  expect(screen.getAllByRole('radio', { name: 'Everyone' }).map((r) => r.props.accessibilityState.selected)).toEqual([false, true]);
  expect(screen.queryByText(/They must total 100%/)).toBeNull();
});

test('edits the deposit and deductions and saves the split through the repo', async () => {
  await render(<DepositSplitScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Deposit amount'), '1800,50');
  // Clearing the Walls amount removes that deduction; Oven gets a new one charged to Ana.
  await fireEvent.changeText(screen.getByLabelText('Deduction for Walls'), '');
  await fireEvent.changeText(screen.getByLabelText('Deduction for Oven'), '75');
  await fireEvent.press(screen.getAllByRole('radio', { name: 'Ana' })[1]);
  await save();
  expect(repo.setDepositSplit).toHaveBeenCalledWith(db, 2, expect.any(String));
  expect(saved()).toEqual({
    depositCents: 180050,
    tenants: [{ id: 1, name: 'Ana', percent: 60 }, { id: 2, name: 'Bo', percent: 40 }],
    deductions: { 202: { cents: 7500, to: 1 } },
  });
  expect(router.back).toHaveBeenCalled();
});

test('removing a person shares their deductions, and a new person starts on an equal split', async () => {
  await render(<DepositSplitScreen />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Remove person 2' }));
  expect(screen.queryByLabelText('Person 2')).toBeNull();
  // Ana alone at 60% is flagged before saving.
  expect(screen.getByText('Percentages total 60%. They must total 100%, or leave all blank for an equal split.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Share percentage for person 1'), '');
  await fireEvent.press(screen.getByRole('button', { name: 'Add person' }));
  await fireEvent.changeText(screen.getByLabelText('Person 2'), ' Cy ');
  expect(screen.getAllByRole('radio', { name: 'Everyone', selected: true })).toHaveLength(2);
  await save();
  expect(saved()).toEqual({
    depositCents: 150000,
    tenants: [{ id: 1, name: 'Ana', percent: null }, { id: 2, name: 'Cy', percent: null }],
    deductions: { 200: { cents: 12050, to: null } },
  });
});

test('starts from the tenant name when nothing is stored, and saves a blank deposit as none', async () => {
  setup({ deposit_split: null, tenant_name: 'Dee' });
  await render(<DepositSplitScreen />);
  expect(await screen.findByDisplayValue('Dee')).toBeOnTheScreen();
  expect(value('Deposit amount')).toBe('');
  expect(value('Deduction for Walls')).toBe('');
  await save();
  expect(saved()).toEqual({ depositCents: null, tenants: [{ id: 1, name: 'Dee', percent: null }], deductions: {} });
});

test.each([
  ['Deposit amount', '-100', 'Deposit amount is not a valid amount.'],
  ['Deposit amount', 'abc', 'Deposit amount is not a valid amount.'],
  ['Deduction for Walls', '-5', 'Walls is not a valid amount.'],
  ['Deduction for Oven', '12.345', 'Oven is not a valid amount.'],
  ['Share percentage for person 1', 'lots', 'Ana is not a valid amount.'],
  ['Share percentage for person 1', '-60', 'Ana is not a valid amount.'],
])('rejects %s of %p without saving', async (label, text, body) => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<DepositSplitScreen />);
  await fireEvent.changeText(await screen.findByLabelText(label), text);
  await save();
  expect(alert).toHaveBeenCalledWith('Check the amount', body);
  expect(repo.setDepositSplit).not.toHaveBeenCalled();
  expect(router.back).not.toHaveBeenCalled();
});

test('percentages that do not total 100 are flagged and block saving', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<DepositSplitScreen />);
  await fireEvent.changeText(await screen.findByLabelText('Share percentage for person 2'), '30');
  const off = 'Percentages total 90%. They must total 100%, or leave all blank for an equal split.';
  expect(screen.getByText(off)).toBeOnTheScreen();
  await save();
  expect(alert).toHaveBeenCalledWith('Check the percentages', off);
  expect(repo.setDepositSplit).not.toHaveBeenCalled();
});

test('a failed save shows an alert and stays on the screen', async () => {
  jest.mocked(repo.setDepositSplit).mockRejectedValue(new Error('disk full'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<DepositSplitScreen />);
  await screen.findByDisplayValue('1500.00');
  await save();
  expect(alert).toHaveBeenCalledWith('Could not save the deposit split', 'disk full');
  expect(router.back).not.toHaveBeenCalled();
});

test.each([
  [{ kind: 'move_in' }],
  [{ linked_move_in_id: null }],
])('refuses an inspection that is not a linked move-out (%p)', async (moveOut) => {
  setup(moveOut);
  await render(<DepositSplitScreen />);
  expect(await screen.findByText('Only a move-out linked to a move-in can split the deposit.')).toBeOnTheScreen();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByLabelText('Deposit amount')).toBeNull();
});
