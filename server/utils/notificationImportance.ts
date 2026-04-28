/**
 * Importance scoring for notifications.
 *
 * Phase E1: rule-based heuristic. Returns 0..1 where higher = more important.
 * Powers the "Sort by importance" toggle in the inbox.
 *
 * Phase E2 may layer Workers AI on top to refine for individual users (learn
 * from dismissal patterns), but for now the heuristic is deterministic, free,
 * and runs everywhere createNotification is called (including from utils
 * without H3Event in scope).
 */

import type { NotificationReason } from '~~/server/utils/notifications'

interface ImportanceInput {
  type: string                       // notification type, e.g. 'task_assigned'
  reason?: NotificationReason | null // dispatch reason
  metadata?: Record<string, any>
}

/**
 * Reason weights — the strongest signal we have. Mention/assignment are
 * direct user-action and bypass everything else; watching_* is opt-in
 * curiosity; direct is system messages.
 */
const REASON_WEIGHT: Record<string, number> = {
  mentioned: 0.90,
  assigned: 0.80,
  watching_item: 0.50,
  watching_board: 0.30,
  direct: 0.40,
}

/**
 * Type bumps for high-stakes events even when reason is permissive.
 * Capped at 1.0; bumps stack additively then clamp.
 */
const TYPE_BUMP: Record<string, number> = {
  task_overdue: 0.95,        // ceiling — anything overdue is top priority
  task_due_soon: 0.20,
  approval_requested: 0.20,
  approval_response: 0.10,
  brief_assigned: 0.10,
  brief_status_changed: 0.05,
  chat_dm: 0.05,
  chat_mention: 0.10,
}

export function computeImportance(input: ImportanceInput): number {
  const reasonWeight = input.reason ? (REASON_WEIGHT[input.reason] ?? 0.40) : 0.40
  const typeBump = TYPE_BUMP[input.type] ?? 0

  // task_overdue is the ceiling type — go straight to ~ceiling regardless.
  if (input.type === 'task_overdue') return 0.95

  // Otherwise: reason base + type bump, clamped.
  const score = reasonWeight + typeBump
  return Math.max(0, Math.min(1, score))
}
