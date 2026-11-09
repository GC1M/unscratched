import * as Notifications from 'expo-notifications';

import { reminderDates } from './reminders';

// Tagged with the inspection id so deleting the inspection can cancel its reminders.
const prefix = (inspectionId: number) => `reminder-${inspectionId}-`;

/** Local notifications only. Asks for permission only when there is something to schedule; if denied, does nothing. */
export async function scheduleReminders(inspectionId: number, moveOutDate: number, now = Date.now()): Promise<void> {
  const reminders = reminderDates(moveOutDate, now);
  if (reminders.length === 0) return;
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;
  for (const [i, r] of reminders.entries()) {
    await Notifications.scheduleNotificationAsync({
      identifier: `${prefix(inspectionId)}${i}`,
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
    });
  }
}

/** Cancels the inspection's pending reminders, e.g. once it is deleted. */
export async function cancelReminders(inspectionId: number): Promise<void> {
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of pending) {
    if (n.identifier.startsWith(prefix(inspectionId))) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
}
