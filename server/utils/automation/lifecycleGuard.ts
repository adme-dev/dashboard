// server/utils/automation/lifecycleGuard.ts
// Thin DB adapter for the A.3 lifecycle transition guard. Domain logic lives in ./lifecycle.
//
// Hooked at the task status-change fan-out (server/api/agency/tasks/[id]/status.patch.ts)
// as a sibling of evaluateAutomations. It OBSERVES a transition and, for a 🟡 (human-approve)
// destination stage, raises an A.1 escalation. It NEVER mutates task state (no move_to_status),
// so it cannot double-fire against the board_automations / automation_rules engine.
//
// Fail-open: errors are logged, never thrown (same contract as evaluateAutomations).

import { queryOne, queryRows } from '~~/server/utils/db'
import { raiseEscalation } from '~~/server/utils/automation/escalationsStore'
import { notifyEscalationApprovers } from '~~/server/utils/automation/notifyEscalation'
import { classifyTransition, lifecycleTransitionToEscalation, filterAlreadyPending } from '~~/server/utils/automation/lifecycle'

interface LifecycleBoardEvent {
  boardId: string
  type: string
  taskId?: string
  actorId?: string
  changes?: {
    oldStatusName?: string
    newStatusName?: string
    oldStatusId?: string
    newStatusId?: string
  }
}

/**
 * Evaluate a single task status transition against the lifecycle taxonomy.
 * Raises a `lifecycle_gate` escalation when the destination is a 🟡 stage.
 * Inert on generic dashboard statuses (they resolve to gate 'auto').
 */
export async function evaluateLifecycleTransition(
  event: LifecycleBoardEvent,
): Promise<{ evaluated: number; raised: number; skipped: number }> {
  const nil = { evaluated: 0, raised: 0, skipped: 0 }
  try {
    if (event?.type !== 'status_changed' || !event.taskId) return nil
    const newStatusName = event.changes?.newStatusName
    if (!newStatusName) return nil

    const { stage, requiresEscalation } = classifyTransition(
      { name: event.changes?.oldStatusName },
      { name: newStatusName },
    )
    if (!requiresEscalation) return { ...nil, evaluated: 1 }

    // Need the task title + client for the escalation card.
    const task = await queryOne<{ title: string; client_id: string | null }>(
      `SELECT t.title, p.client_id
         FROM tasks t
         LEFT JOIN projects p ON t.project_id = p.id
        WHERE t.id = $1`,
      [event.taskId],
    )
    if (!task) return { ...nil, evaluated: 1 }

    const candidate = lifecycleTransitionToEscalation({
      taskId: event.taskId,
      taskTitle: task.title,
      toStatus: newStatusName,
      fromStatus: event.changes?.oldStatusName ?? null,
      clientId: task.client_id ?? null,
    })

    // Dedupe against still-pending lifecycle_gate escalations (same task + same destination).
    const pending = await queryRows<{ detail: Record<string, any> }>(
      `SELECT detail FROM automation_escalations WHERE capability = 'lifecycle_gate' AND status = 'pending'`,
    )
    const fresh = filterAlreadyPending([candidate], pending.map(p => p.detail ?? {}))
    const top = fresh[0]
    if (!top) return { evaluated: 1, raised: 0, skipped: 1 }

    const row = await raiseEscalation(top)
    if (top.severity === 'critical' && row?.id) {
      await notifyEscalationApprovers({
        escalationId: row.id,
        capability: top.capability,
        title: top.title,
        severity: 'critical',
      })
    }
    return { evaluated: 1, raised: 1, skipped: 0 }
  } catch (err) {
    console.error('[lifecycle-guard] failed to evaluate transition', event?.taskId, err)
    return nil
  }
}
