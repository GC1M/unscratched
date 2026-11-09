import * as Notifications from 'expo-notifications';

import { reminderDates } from './reminders';

/** Local notifications only. Asks for permission only when there is something to schedule; if denied, does nothing. */
export async function scheduleReminders(moveOutDate: number, now = Date.now()): Promise<void> {
  const reminders = reminderDates(moveOutDate, now);
  if (reminders.length === 0) return;
  const { granted } = await Notifications.requestPermissionsAsync();
  if (!granted) return;
  for (const r of reminders) {
    await Notifications.scheduleNotificationAsync({
      content: { title: r.title, body: r.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
    });
  }
}
