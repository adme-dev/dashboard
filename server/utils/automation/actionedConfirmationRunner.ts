// server/utils/automation/actionedConfirmationRunner.ts
// Thin, fail-open DB adapter for C7. Pure logic lives in ./actionedConfirmation.
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { raiseEscalation } from '~~/server/utils/automation/escalationsStore'
import { notifyEscalationApprovers } from '~~/server/utils/automation/notifyEscalation'
import { isC7Enabled, isFirstAction, ackNotification, isStalled, stallEscalation, type BriefForC7 } from '~~/server/utils/automation/actionedConfirmation'

const SELECT_BRIEF = `
  SELECT b.id, b.title, b.submitted_by, b.submitted_at, b.assigned_to, b.client_id,
         b.converted_to_task_id, b.converted_to_project_id, b.requested_deadline,
         b.c7_acknowledged_at, b.c7_stall_alerted_at,
         tm.name AS assignee_name
    FROM briefs b
    LEFT JOIN team_members tm ON b.assigned_to = tm.id`

// Called from the brief assignment/conversion endpoints. One ack per brief, ever.
export async function maybeAcknowledgeBrief(briefId: string, opts: { force?: boolean } = {}): Promise<void> {
  if (!isC7Enabled() && !opts.force) return
  try {
    const b = await queryOne<BriefForC7>(`${SELECT_BRIEF} WHERE b.id = $1`, [briefId])
    if (!b || !isFirstAction(b)) return
    // Stamp first (idempotent guard against double-fire) then notify.
    await execute(`UPDATE briefs SET c7_acknowledged_at = NOW() WHERE id = $1 AND c7_acknowledged_at IS NULL`, [briefId])
    const n = ackNotification(b)
    if (n) await createNotification(n)
  } catch (err) {
    console.error('[c7] ack failed', briefId, err)
  }
}

// Daily: find stalled, un-actioned briefs → escalation (team, allowlist-capped) + briefer alert.
export async function runBriefSlaSweep(opts: { now?: Date, force?: boolean } = {}): Promise<{ checked: number, alerted: number }> {
  if (!isC7Enabled() && !opts.force) return { checked: 0, alerted: 0 }
  const now = opts.now ?? new Date()
  let checked = 0
  let alerted = 0
  try {
    const rows = await queryRows<BriefForC7>(
      `${SELECT_BRIEF}
        WHERE b.submitted_at IS NOT NULL
          AND b.c7_acknowledged_at IS NULL AND b.c7_stall_alerted_at IS NULL
          AND b.assigned_to IS NULL AND b.converted_to_task_id IS NULL AND b.converted_to_project_id IS NULL`)
    for (const b of rows) {
      checked++
      if (!isStalled(b, now)) continue
      await execute(`UPDATE briefs SET c7_stall_alerted_at = NOW() WHERE id = $1 AND c7_stall_alerted_at IS NULL`, [b.id])
      const { escalation, briefer } = stallEscalation(b)
      const row = await raiseEscalation(escalation)
      if (row?.id) {
        await notifyEscalationApprovers({ escalationId: row.id, capability: escalation.capability, title: escalation.title, severity: 'warning' })
      }
      if (briefer) await createNotification(briefer)
      alerted++
    }
  } catch (err) {
    console.error('[c7] sla sweep failed', err)
  }
  return { checked, alerted }
}
