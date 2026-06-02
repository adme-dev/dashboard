// server/utils/crm/activation.ts
// Pure helpers for the CRM activation crons (P4.1) — reminders, score decay,
// lifecycle dormancy. DB I/O + notification fan-out live in the cron endpoints;
// these are the framework-free, unit-tested decisions.

export interface ReminderTask {
  id: string
  client_id: string
  title: string
  assigned_to: string | null
  reminder_at: string // ISO — already filtered to (reminder_at <= now AND reminded_at IS NULL) in SQL
  due_at: string | null
}

export interface ReminderPartition {
  /** Recently-due reminders with an assignee — notify, then mark reminded. */
  toNotify: ReminderTask[]
  /** Older-than-window or unassigned — mark reminded WITHOUT notifying. */
  toDrain: ReminderTask[]
}

// Reminders due more than this many hours ago are quietly drained rather than
// notified. This is the anti-flood guard: on first activation (or after the
// cron has been down), a backlog of long-overdue reminders is marked reminded
// without firing a wall of notifications. The count drained is logged, never
// silently dropped.
export const REMINDER_FLOOD_WINDOW_HOURS = 26

export function partitionReminders(
  tasks: ReminderTask[],
  now: Date,
  windowHours: number = REMINDER_FLOOD_WINDOW_HOURS,
): ReminderPartition {
  const cutoff = now.getTime() - windowHours * 3600000
  const toNotify: ReminderTask[] = []
  const toDrain: ReminderTask[] = []
  for (const t of tasks) {
    const due = new Date(t.reminder_at).getTime()
    if (t.assigned_to && due >= cutoff) toNotify.push(t)
    else toDrain.push(t)
  }
  return { toNotify, toDrain }
}

// Default days of inactivity before an 'active' contact auto-goes dormant,
// when a client hasn't set crm_settings.dormancy_days.
export const DEFAULT_DORMANCY_DAYS = 90

export function resolveDormancyDays(setting: number | null | undefined): number {
  if (setting == null || setting <= 0) return DEFAULT_DORMANCY_DAYS
  return setting
}

// Pure dormancy decision. `lastTouchedAt` is the most recent signal for the
// contact (the SQL computes it as GREATEST(last activity, updated_at, created_at)
// so a brand-new active contact with no logged activity isn't instantly dormant).
// Never goes dormant without evidence, or when the threshold is non-positive.
export function isDormant(lastTouchedAt: string | null, now: Date, thresholdDays: number): boolean {
  if (thresholdDays <= 0 || !lastTouchedAt) return false
  const days = (now.getTime() - new Date(lastTouchedAt).getTime()) / 86400000
  return days >= thresholdDays
}
