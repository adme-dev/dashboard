// server/utils/crm/activation.ts
// Pure helpers for the CRM activation crons (P4.1) — reminders, score decay,
// lifecycle dormancy. DB I/O + notification fan-out live in the cron endpoints;
// these are the framework-free, unit-tested decisions.
import { transaction as defaultTransaction } from '~~/server/utils/db'
import {
  requireAllCrmRecordsAccess,
  type AuthoritativeCrmRecord,
  type CrmRecordRef,
  type TransactionClient
} from '~~/server/utils/crm/recordAccess'
import {
  resolveTrustedCrmSystemContext,
  type CrmRecordAccessContext,
  type TrustedCrmSystemPurpose
} from '~~/server/utils/crm/searchContext'

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

export interface ClaimedReminderTask {
  id: string
  client_id: string
  reminded_at: string
}

interface TrustedReminderDependencies {
  resolveContext: (input: { clientId: string; purpose: TrustedCrmSystemPurpose }) => Promise<CrmRecordAccessContext>
  authorizeAll: (
    context: CrmRecordAccessContext,
    refs: readonly CrmRecordRef[],
    client?: TransactionClient
  ) => Promise<readonly AuthoritativeCrmRecord[]>
}

interface ClaimReminderDependencies extends TrustedReminderDependencies {
  transaction: <T>(callback: (client: TransactionClient) => Promise<T>) => Promise<T>
}

const trustedReminderDependencies: TrustedReminderDependencies = {
  resolveContext: resolveTrustedCrmSystemContext,
  authorizeAll: requireAllCrmRecordsAccess
}

function groupRemindersByClient(tasks: readonly ReminderTask[]) {
  const groups = new Map<string, ReminderTask[]>()
  for (const task of tasks) {
    const group = groups.get(task.client_id) ?? []
    group.push(task)
    groups.set(task.client_id, group)
  }
  return groups
}

function isUniformNotFound(error: unknown) {
  return (error as { statusCode?: unknown } | null)?.statusCode === 404
}

/**
 * Removes work whose client or records cannot be authoritatively reloaded.
 * A whole client batch is discarded if any candidate has gone stale so a
 * downstream summary cannot disclose partial record state.
 */
export async function authorizeTrustedReminderTasks(
  tasks: readonly ReminderTask[],
  purpose: TrustedCrmSystemPurpose,
  deps: TrustedReminderDependencies = trustedReminderDependencies
): Promise<ReminderTask[]> {
  const authorized: ReminderTask[] = []
  for (const [clientId, clientTasks] of groupRemindersByClient(tasks)) {
    try {
      const context = await deps.resolveContext({ clientId, purpose })
      const records = await deps.authorizeAll(
        context,
        clientTasks.map(task => ({ type: 'task' as const, id: task.id }))
      )
      if (records.length === clientTasks.length) authorized.push(...clientTasks)
    } catch (error) {
      if (!isUniformNotFound(error)) throw error
    }
  }
  return authorized
}

/** Authorize and lock every task in each client batch before marking it. */
export async function claimTrustedReminderTasks(
  input: {
    tasks: readonly ReminderTask[]
    remindedAt: Date
    purpose: TrustedCrmSystemPurpose
  },
  deps: ClaimReminderDependencies = {
    ...trustedReminderDependencies,
    transaction: defaultTransaction as unknown as ClaimReminderDependencies['transaction']
  }
): Promise<ClaimedReminderTask[]> {
  const claimed: ClaimedReminderTask[] = []
  for (const [clientId, clientTasks] of groupRemindersByClient(input.tasks)) {
    try {
      const context = await deps.resolveContext({ clientId, purpose: input.purpose })
      const rows = await deps.transaction(async (client) => {
        const records = await deps.authorizeAll(
          context,
          clientTasks.map(task => ({ type: 'task' as const, id: task.id })),
          client
        )
        if (records.length !== clientTasks.length) return []
        const result = await client.query(
          `UPDATE crm_tasks
              SET reminded_at = $1::timestamptz
            WHERE client_id = $2
              AND id = ANY($3::uuid[])
              AND deleted_at IS NULL
              AND status IN ('pending','in_progress')
              AND reminder_at IS NOT NULL
              AND reminded_at IS NULL
              AND reminder_at <= $1::timestamptz
            RETURNING id::text AS id, client_id::text AS client_id, reminded_at::text AS reminded_at`,
          [input.remindedAt.toISOString(), clientId, clientTasks.map(task => task.id)]
        )
        return (result.rows ?? []) as ClaimedReminderTask[]
      })
      claimed.push(...rows)
    } catch (error) {
      if (!isUniformNotFound(error)) throw error
    }
  }
  return claimed
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
