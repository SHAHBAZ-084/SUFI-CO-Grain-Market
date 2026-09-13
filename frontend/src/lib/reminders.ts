import { api, type Reminder } from './api';

export const REMINDERS_CHANGED_EVENT = 'reminders-changed';

export function notifyRemindersChanged() {
  window.dispatchEvent(new Event(REMINDERS_CHANGED_EVENT));
}

export const REMINDER_HOUR_MS = 60 * 60 * 1000;
export const REMINDER_MAX_NOTIFICATIONS = 9;

export type ReminderSeverity = 'green' | 'yellow' | 'red';

export function reminderSeverityForCount(notifyCount: number): ReminderSeverity {
  if (notifyCount <= 3) return 'green';
  if (notifyCount <= 6) return 'yellow';
  return 'red';
}

export function reminderSeverityLabel(severity: ReminderSeverity): string {
  if (severity === 'green') return 'Green';
  if (severity === 'yellow') return 'Yellow';
  return 'Red';
}

/** How many notifications should have fired by `now` (1 at due time, +1 each hour, cap 9). */
export function expectedNotifyCount(reminderAtIso: string, now = Date.now()): number {
  const due = new Date(reminderAtIso).getTime();
  if (!Number.isFinite(due) || now < due) return 0;
  const hoursElapsed = Math.floor((now - due) / REMINDER_HOUR_MS);
  return Math.min(REMINDER_MAX_NOTIFICATIONS, hoursElapsed + 1);
}

export function formatReminderWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function ensureNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function showDesktopNotification(title: string, body: string, tag: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // Browser Notification API — works in Electron renderer without custom IPC.
    // eslint-disable-next-line no-new
    new Notification(title, { body, tag, silent: false });
  } catch {
    // ignore notification failures
  }
}

function tierTitle(severity: ReminderSeverity, n: number): string {
  const label = reminderSeverityLabel(severity);
  return `${label} reminder (${n}/${REMINDER_MAX_NOTIFICATIONS})`;
}

/**
 * Process due / overdue reminders: catch-up once if behind, else hourly fires up to 9.
 * Persists notifyCount / lastNotifiedAt via the API.
 */
export async function processReminderNotifications(
  reminders: Reminder[],
): Promise<boolean> {
  const pending = reminders.filter((r) => r.status === 'PENDING');
  if (pending.length === 0) return false;

  const allowed = await ensureNotificationPermission();
  if (!allowed) return false;

  const now = Date.now();
  let changed = false;

  for (const reminder of pending) {
    if (reminder.notifyCount >= REMINDER_MAX_NOTIFICATIONS) continue;

    const due = new Date(reminder.reminderAt).getTime();
    if (!Number.isFinite(due) || now < due) continue;

    // Next scheduled fire is reminderAt + notifyCount hours.
    const nextAt = due + reminder.notifyCount * REMINDER_HOUR_MS;
    if (now < nextAt) continue;

    const expected = expectedNotifyCount(reminder.reminderAt, now);
    const accountName = reminder.account?.name ?? `Account #${reminder.accountId}`;
    const when = formatReminderWhen(reminder.reminderAt);
    const amount = Number(reminder.amount).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    if (expected > reminder.notifyCount + 1) {
      // Missed multiple hourly slots while closed/idle — one catch-up, jump tier.
      showDesktopNotification(
        `You're late — ${accountName}`,
        `Reminder for ${accountName} (Rs ${amount}) was due ${when}. Please settle it.`,
        `reminder-catchup-${reminder.id}`,
      );
      await api.recordReminderNotification(reminder.id, { notifyCount: expected });
      changed = true;
      continue;
    }

    const nextCount = Math.min(REMINDER_MAX_NOTIFICATIONS, reminder.notifyCount + 1);
    const severity = reminderSeverityForCount(nextCount);
    showDesktopNotification(
      tierTitle(severity, nextCount),
      `${accountName} — Rs ${amount}${reminder.note ? ` — ${reminder.note}` : ''} (due ${when})`,
      `reminder-${reminder.id}-${nextCount}`,
    );
    await api.recordReminderNotification(reminder.id, { notifyCount: nextCount });
    changed = true;
  }

  return changed;
}

export async function refreshAndProcessReminders(): Promise<Reminder[]> {
  const rows = await api.listReminders('PENDING');
  const changed = await processReminderNotifications(rows);
  if (changed) {
    const fresh = await api.listReminders('PENDING');
    notifyRemindersChanged();
    return fresh;
  }
  return rows;
}
