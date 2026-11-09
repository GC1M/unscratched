import * as Notifications from 'expo-notifications';

import { cancelReminders, scheduleReminders } from './scheduleReminders';

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

const day = 24 * 60 * 60 * 1000;
const now = new Date(2026, 0, 1).getTime();

beforeEach(() => jest.clearAllMocks());

test('permission denied schedules nothing', async () => {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: false } as never);
  await scheduleReminders(7, now + 60 * day, now);
  expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('permission granted schedules one local notification per future reminder', async () => {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: true } as never);
  await scheduleReminders(7, now + 60 * day, now);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(3);
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
    identifier: 'reminder-7-0',
    content: { title: 'Schedule your move-out walkthrough', body: expect.any(String) },
    trigger: { type: 'date', date: expect.any(Number) },
  });
});

test('only future reminders are scheduled', async () => {
  jest.mocked(Notifications.requestPermissionsAsync).mockResolvedValue({ granted: true } as never);
  await scheduleReminders(7, now - 20 * day, now); // day 14 passed, day 30 ahead
  expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
});

test('a past move-out date does not even ask for permission', async () => {
  await scheduleReminders(7, now - 100 * day, now);
  expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
});

test('cancelReminders cancels only that inspection\'s reminders', async () => {
  jest.mocked(Notifications.getAllScheduledNotificationsAsync).mockResolvedValue(
    ['reminder-7-0', 'reminder-7-1', 'reminder-70-0', 'reminder-8-0'].map((identifier) => ({ identifier })) as never,
  );
  await cancelReminders(7);
  expect(jest.mocked(Notifications.cancelScheduledNotificationAsync).mock.calls).toEqual([['reminder-7-0'], ['reminder-7-1']]);
});
