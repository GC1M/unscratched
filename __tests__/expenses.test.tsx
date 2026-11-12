import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import * as api from '@/expenses/api';
import type { GroupData } from '@/expenses/types';

import ExpenseEditor from '../app/expenses/[groupId]/expense';
import ExpenseGroup from '../app/expenses/[groupId]/index';

jest.mock('@/expenses/api', () => ({
  loadGroup: jest.fn(), currentUserId: jest.fn(), recordSettlement: jest.fn(async () => {}), deleteSettlement: jest.fn(),
  deleteRecurring: jest.fn(), saveExpense: jest.fn(async () => ({})), saveRecurring: jest.fn(async () => {}), deleteExpense: jest.fn(),
  receiptUrl: jest.fn(), uploadReceipt: jest.fn(), localToday: () => '2026-11-12',
}));
jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: true }, jest.fn()] }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-router', () =>
  jest.requireActual('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: jest.fn(() => ({ groupId: 'g' })) }),
);

const data = (): GroupData => ({
  group: { id: 'g', name: 'Flat 4', currency: 'USD', invite_code: 'ABCD2345', created_by: 'a', created_at: '' },
  members: [{ user_id: 'a', display_name: 'Ana' }, { user_id: 'b', display_name: 'Bo' }, { user_id: 'c', display_name: 'Cy' }],
  expenses: [
    {
      id: 'e1', group_id: 'g', description: 'Groceries', amount_cents: 3000, payer_id: 'a', category: 'groceries', spent_on: '2026-11-01',
      split_mode: 'equal', items: null, receipt_path: null, recurring_id: null, created_by: 'a', created_at: '1',
      shares: { a: 1000, b: 1000, c: 1000 },
    },
  ],
  settlements: [],
  recurring: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(api.loadGroup).mockResolvedValue(data());
  jest.mocked(api.currentUserId).mockResolvedValue('a');
});

test('the group shows balances and records a suggested payment after confirming', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ExpenseGroup />);
  expect(await screen.findByText('Is owed $20.00')).toBeOnTheScreen();
  expect(screen.getAllByText('Owes $10.00')).toHaveLength(2);
  await fireEvent.press(screen.getByLabelText('Bo pays You $10.00. Record payment'));
  const buttons = alert.mock.calls[0][2] as AlertButton[];
  await buttons[1].onPress!();
  expect(api.recordSettlement).toHaveBeenCalledWith('g', 'b', 'a', 1000);
});

test('search filters the activity list', async () => {
  await render(<ExpenseGroup />);
  await fireEvent.changeText(await screen.findByLabelText('Search expenses'), 'rent');
  expect(screen.getByText('No expenses match.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Search expenses'), 'groc ana');
  expect(screen.getByText('Groceries')).toBeOnTheScreen();
});

test('a new expense splits equally among the people picked and saves exact shares', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Pizza');
  await fireEvent.changeText(screen.getByLabelText('Amount (USD)'), '10');
  expect(screen.getByText('Ana $3.34 · Bo $3.33 · Cy $3.33')).toBeOnTheScreen();
  await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Cy' })[0]);
  expect(screen.getByText('Ana $5.00 · Bo $5.00')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({
    id: null, groupId: 'g', description: 'Pizza', amountCents: 1000, payerId: 'a', splitMode: 'equal', shares: { a: 500, b: 500 },
  }));
});

test('exact amounts must add up before saving', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Power');
  await fireEvent.changeText(screen.getByLabelText('Amount (USD)'), '30');
  await fireEvent.press(screen.getByRole('radio', { name: 'Exact amounts' }));
  await fireEvent.changeText(screen.getByLabelText('Ana amount'), '20');
  expect(screen.getByText('Amounts must add up to the total ($10.00 left).')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled();
  await fireEvent.changeText(screen.getByLabelText('Bo amount'), '10');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 3000, shares: { a: 2000, b: 1000, c: 0 } }));
});

test('itemized: each item goes to its people and tax is shared by what they ordered', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Dinner');
  await fireEvent.press(screen.getByRole('radio', { name: 'By item' }));
  await fireEvent.changeText(screen.getByLabelText('Item 1 amount'), '30');
  await fireEvent.press(screen.getByRole('checkbox', { name: 'Cy' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add item' }));
  await fireEvent.changeText(screen.getByLabelText('Item 2 amount'), '10');
  await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Ana' })[1]);
  await fireEvent.press(screen.getAllByRole('checkbox', { name: 'Bo' })[1]);
  await fireEvent.changeText(screen.getByLabelText('Tax and tip (split by what each person ordered)'), '4');
  // Ana and Bo split item 1 ($15 each); Cy has item 2 ($10). $4 tax goes 15:15:10.
  expect(screen.getByText('Ana $16.50 · Bo $16.50 · Cy $11.00 · total $44.00')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(api.saveExpense).toHaveBeenCalledWith(expect.objectContaining({
    amountCents: 4400, splitMode: 'itemized', shares: { a: 1650, b: 1650, c: 1100 },
  }));
});

test('choosing a repeat saves a recurring expense instead of a one-off', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Rent');
  await fireEvent.changeText(screen.getByLabelText('Amount (USD)'), '1500');
  await fireEvent.press(screen.getByRole('radio', { name: 'Monthly' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(api.saveExpense).not.toHaveBeenCalled();
  expect(api.saveRecurring).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 150000, every: 'monthly', shares: { a: 50000, b: 50000, c: 50000 } }));
});
