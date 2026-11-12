import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import * as api from '@/expenses/api';
import type { GroupData } from '@/expenses/types';

import Expenses from '../app/expenses/index';
import ExpenseEditor from '../app/expenses/[groupId]/expense';
import History from '../app/expenses/[groupId]/history';
import ExpenseGroup from '../app/expenses/[groupId]/index';
import GroupSettings from '../app/expenses/[groupId]/settings';
import Settle from '../app/expenses/[groupId]/settle';

jest.mock('@/expenses/api', () => ({
  loadGroup: jest.fn(), currentUserId: jest.fn(), recordSettlement: jest.fn(async () => {}), deleteSettlement: jest.fn(),
  deleteRecurring: jest.fn(), saveExpense: jest.fn(async () => ({})), saveRecurring: jest.fn(async () => {}), deleteExpense: jest.fn(async () => {}),
  receiptUrl: jest.fn(), uploadReceipt: jest.fn(), localToday: () => '2026-11-12', watchGroup: jest.fn(() => () => {}),
  listComments: jest.fn(async () => []), addComment: jest.fn(async () => {}), deleteComment: jest.fn(async () => {}),
  exchangeRate: jest.fn(async () => 1.1), listActivity: jest.fn(async () => []), addPlaceholder: jest.fn(async () => {}),
  removeMember: jest.fn(async () => {}), resetInvite: jest.fn(async () => 'NEWCODE2'), updateGroup: jest.fn(async () => {}),
  renameMe: jest.fn(async () => {}), deleteGroup: jest.fn(async () => {}), supabase: jest.fn(() => ({})), listGroups: jest.fn(async () => []),
  groupPreview: jest.fn(), joinGroup: jest.fn(async () => ({ id: 'g' })), createGroup: jest.fn(), sendCode: jest.fn(), verifyCode: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('@/db/client', () => ({ getDb: jest.fn(async () => ({})) }));
jest.mock('expo-camera', () => ({ CameraView: () => null, useCameraPermissions: () => [{ granted: true }, jest.fn()] }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-router', () =>
  jest.requireActual('@/test/expoRouter').mockExpoRouter({ useLocalSearchParams: jest.fn(() => ({ groupId: 'g' })) }),
);

const data = (): GroupData => ({
  group: { id: 'g', name: 'Flat 4', currency: 'USD', invite_code: 'ABCD2345', created_by: 'a', created_at: '', simplify_debts: true, default_shares: null },
  members: [
    { user_id: 'a', display_name: 'Ana', placeholder: false, left_at: null },
    { user_id: 'b', display_name: 'Bo', placeholder: false, left_at: null },
    { user_id: 'c', display_name: 'Cy', placeholder: false, left_at: null },
  ],
  expenses: [
    {
      id: 'e1', group_id: 'g', description: 'Groceries', amount_cents: 3000, payer_id: 'a', category: 'groceries', spent_on: '2026-11-01',
      split_mode: 'equal', items: null, receipt_path: null, recurring_id: null, created_by: 'a', created_at: '1',
      shares: { a: 1000, b: 1000, c: 1000 }, payers: { a: 3000 }, notes: null, original_currency: null, original_amount_cents: null,
      deleted_at: null,
    },
  ],
  deleted: [],
  settlements: [],
  recurring: [],
});

const groceries = () => data().expenses[0];

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
    id: null, groupId: 'g', description: 'Pizza', amountCents: 1000, payers: { a: 1000 }, splitMode: 'equal', shares: { a: 500, b: 500 },
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

const saved = () => jest.mocked(api.saveExpense).mock.calls[0][0];

test('several payers: amounts must add up, then each payer is saved', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Dinner');
  await fireEvent.changeText(screen.getByLabelText('Amount (USD)'), '30');
  await fireEvent.press(screen.getByRole('radio', { name: 'Several people' }));
  await fireEvent.changeText(screen.getByLabelText('Ana paid'), '20');
  expect(screen.getByText('What each person paid must add up to the total ($10.00 left).')).toBeOnTheScreen();
  expect(screen.queryByRole('radio', { name: 'Monthly' })).toBeNull(); // a repeat has one payer
  await fireEvent.changeText(screen.getByLabelText('Bo paid'), '10');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(saved()).toEqual(expect.objectContaining({ amountCents: 3000, payers: { a: 2000, b: 1000 }, shares: { a: 1000, b: 1000, c: 1000 } }));
});

test('adjust split: extras and discounts on top of an equal split', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Power');
  await fireEvent.changeText(screen.getByLabelText('Amount (USD)'), '30');
  await fireEvent.press(screen.getByRole('radio', { name: 'Adjust' }));
  await fireEvent.changeText(screen.getByLabelText('Ana adjustment'), '+6');
  await fireEvent.changeText(screen.getByLabelText('Bo adjustment'), '-3');
  expect(screen.getByText('Ana $15.00 · Bo $6.00 · Cy $9.00')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Bo adjustment'), '-20');
  expect(screen.getByText('Adjustments are more than the total, or a discount is bigger than a share.')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Bo adjustment'), '-3');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(saved()).toEqual(expect.objectContaining({ splitMode: 'adjust', shares: { a: 1500, b: 600, c: 900 } }));
});

test('another currency is converted at the fetched rate, keeping what was typed', async () => {
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Description'), 'Train');
  await fireEvent.changeText(screen.getByLabelText('Currency'), 'eur');
  await fireEvent.changeText(screen.getByLabelText('Amount (EUR)'), '10');
  expect(await screen.findByDisplayValue('1.1')).toBeOnTheScreen();
  expect(api.exchangeRate).toHaveBeenCalledWith('EUR', 'USD');
  expect(screen.getByText('Ana $3.68 · Bo $3.66 · Cy $3.66 · total $11.00')).toBeOnTheScreen();
  await fireEvent.changeText(screen.getByLabelText('Notes'), '  Airport  ');
  await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
  expect(saved()).toEqual(expect.objectContaining({
    amountCents: 1100, payers: { a: 1100 }, shares: { a: 368, b: 366, c: 366 }, original: { currency: 'EUR', cents: 1000 }, notes: 'Airport',
  }));
});

test('a group default split prefills new expenses as shares', async () => {
  const d = data();
  d.group.default_shares = { a: 2, b: 1, c: 1 };
  jest.mocked(api.loadGroup).mockResolvedValue(d);
  await render(<ExpenseEditor />);
  await fireEvent.changeText(await screen.findByLabelText('Amount (USD)'), '40');
  expect(screen.getByText('Ana $20.00 · Bo $10.00 · Cy $10.00')).toBeOnTheScreen();
});

test('editing a foreign expense with several payers loads it back in the typed currency', async () => {
  const d = data();
  d.expenses = [{ ...groceries(), amount_cents: 1100, original_currency: 'EUR', original_amount_cents: 1000, payers: { a: 660, b: 440 },
    shares: { a: 367, b: 367, c: 366 }, split_mode: 'equal', notes: 'Hi' }];
  jest.mocked(api.loadGroup).mockResolvedValue(d);
  const params = jest.requireMock('expo-router').useLocalSearchParams as jest.Mock;
  params.mockReturnValue({ groupId: 'g', id: 'e1' });
  try {
    await render(<ExpenseEditor />);
    expect(await screen.findByDisplayValue('10.00')).toBeOnTheScreen();
    expect(screen.getByLabelText('Currency').props.value).toBe('EUR');
    expect(screen.getByLabelText('Ana paid').props.value).toBe('6.00');
    expect(screen.getByLabelText('Bo paid').props.value).toBe('4.00');
    await fireEvent.press(screen.getByRole('button', { name: 'Save expense' }));
    expect(saved()).toEqual(expect.objectContaining({ id: 'e1', amountCents: 1100, payers: { a: 660, b: 440 }, notes: 'Hi' }));
  } finally {
    params.mockReturnValue({ groupId: 'g' });
  }
});

test('comments on an existing expense: list, post, and delete your own', async () => {
  jest.mocked(api.listComments).mockResolvedValue([
    { id: 'k1', expense_id: 'e1', user_id: 'b', body: 'Thanks!', created_at: '' },
    { id: 'k2', expense_id: 'e1', user_id: 'a', body: 'np', created_at: '' },
  ]);
  const params = jest.requireMock('expo-router').useLocalSearchParams as jest.Mock;
  params.mockReturnValue({ groupId: 'g', id: 'e1' });
  try {
    await render(<ExpenseEditor />);
    expect(await screen.findByText('Bo: Thanks!')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: 'Delete comment' })).toHaveLength(1); // only Ana's own
    await fireEvent.changeText(screen.getByLabelText('Add a comment'), 'Paid in cash');
    await fireEvent.press(screen.getByRole('button', { name: 'Post comment' }));
    expect(api.addComment).toHaveBeenCalledWith('g', 'e1', 'Paid in cash');
    await fireEvent.press(screen.getByRole('button', { name: 'Delete comment' }));
    expect(api.deleteComment).toHaveBeenCalledWith('k2');
  } finally {
    params.mockReturnValue({ groupId: 'g' });
  }
});

test('with simplify off, the group lists who owes whom pair by pair', async () => {
  const d = data();
  d.group.simplify_debts = false;
  d.expenses.push({ ...groceries(), id: 'e2', payer_id: 'b', payers: { b: 3000 }, shares: { b: 1500, c: 1500 } });
  jest.mocked(api.loadGroup).mockResolvedValue(d);
  await render(<ExpenseGroup />);
  expect(await screen.findByText('Who owes whom')).toBeOnTheScreen();
  expect(screen.getByLabelText('Cy pays Bo $15.00. Record payment')).toBeOnTheScreen();
  expect(screen.getByLabelText('Bo pays You $10.00. Record payment')).toBeOnTheScreen();
  expect(screen.getByLabelText('Cy pays You $10.00. Record payment')).toBeOnTheScreen();
});

test('the group subscribes to live changes and offers a reminder to the person owed', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<ExpenseGroup />);
  await fireEvent.press(await screen.findByLabelText('Bo pays You $10.00. Record payment'));
  expect(api.watchGroup).toHaveBeenCalledWith('g', expect.any(Function));
  const labels = (alert.mock.calls[0][2] as AlertButton[]).map((b) => b.text);
  expect(labels).toEqual(['Cancel', 'Record payment', 'Record another amount', 'Send a reminder']);
});

test('record a payment of any amount between two people', async () => {
  await render(<Settle />);
  await fireEvent.press((await screen.findAllByRole('radio', { name: 'Bo' }))[0]); // who paid (first group)
  const save = () => screen.getAllByRole('button', { name: 'Record a payment' }).at(-1)!;
  expect(save()).toBeDisabled();
  await fireEvent.press(screen.getAllByRole('radio', { name: 'Cy' })[1]);
  await fireEvent.changeText(screen.getByLabelText('Amount (USD)'), '7.5');
  await fireEvent.press(save());
  expect(api.recordSettlement).toHaveBeenCalledWith('g', 'b', 'c', 750, '2026-11-12');
});

test('settings: add someone not signed up yet, toggle simplify, save a default split, remove a member', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  await render(<GroupSettings />);
  await fireEvent.changeText(await screen.findByLabelText('Their name'), 'Dee');
  await fireEvent.press(screen.getByRole('button', { name: 'Add person' }));
  expect(api.addPlaceholder).toHaveBeenCalledWith('g', 'Dee');
  await fireEvent.press(screen.getByRole('radio', { name: 'Off' }));
  expect(api.updateGroup).toHaveBeenCalledWith('g', { simplify_debts: false });
  await fireEvent.changeText(screen.getByLabelText('Ana shares'), '2');
  await fireEvent.changeText(screen.getByLabelText('Bo shares'), '1');
  await fireEvent.press(screen.getByRole('button', { name: 'Save default split' }));
  expect(api.updateGroup).toHaveBeenCalledWith('g', { default_shares: { a: 2, b: 1, c: 0 } });
  await fireEvent.press(screen.getByLabelText('Bo. Remove from group'));
  const [title, body, buttons] = alert.mock.calls.at(-1)!;
  expect(title).toBe('Remove Bo?');
  expect(body).toBe('Their balance is not zero, so this will not work until they settle up.');
  await (buttons as AlertButton[])[1].onPress!();
  expect(api.removeMember).toHaveBeenCalledWith('g', 'b');
  expect(screen.getByRole('button', { name: 'Delete group' })).toBeOnTheScreen(); // Ana created it
});

test('history lists what happened and restores a deleted expense', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const d = data();
  d.deleted = [{ ...groceries(), id: 'x', description: 'Old pizza', deleted_at: '2026-11-11T00:00:00Z' }];
  jest.mocked(api.loadGroup).mockResolvedValue(d);
  jest.mocked(api.listActivity).mockResolvedValue([
    { id: 2, actor_id: 'b', kind: 'expense_edited', ref_id: 'e1', detail: { description: 'Groceries', amount_cents: 3000, old_amount_cents: 2500 }, created_at: '2026-11-12T10:00:00Z' },
    { id: 1, actor_id: 'a', kind: 'payment_added', ref_id: null, detail: { from_id: 'b', to_id: 'a', amount_cents: 500 }, created_at: '2026-11-12T09:00:00Z' },
  ]);
  await render(<History />);
  expect(await screen.findByText('Bo changed "Groceries" ($25.00 to $30.00)')).toBeOnTheScreen();
  expect(screen.getByText('You recorded: Bo paid You $5.00')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Old pizza. Restore'));
  await (alert.mock.calls[0][2] as AlertButton[])[1].onPress!();
  expect(api.deleteExpense).toHaveBeenCalledWith('x', true);
});

test('joining with a code can take over a spot added for you', async () => {
  jest.mocked(api.currentUserId).mockResolvedValue('z');
  jest.mocked(api.groupPreview).mockResolvedValue({ id: 'g', name: 'Flat 4', currency: 'USD', placeholders: [{ user_id: 'p', display_name: 'Dee' }] });
  await render(<Expenses />);
  await fireEvent.press(await screen.findByRole('button', { name: 'Join with invite code' }));
  await fireEvent.changeText(screen.getByLabelText('Invite code'), 'abcd2345');
  expect(await screen.findByText('Joining "Flat 4"')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('radio', { name: 'Dee' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Join group' }));
  expect(api.joinGroup).toHaveBeenCalledWith('ABCD2345', '', 'p');
});
