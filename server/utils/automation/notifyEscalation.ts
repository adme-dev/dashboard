// server/utils/automation/notifyEscalation.ts
import { queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { escalationNotificationParams, type EscalationSeverity } from '~~/server/utils/automation/escalations'

// Roles in the AUTOMATION permission group (see server/utils/permissions.ts).
const AUTOMATION_ROLES = ['owner', 'admin', 'lead', 'project_manager']

export async function notifyEscalationApprovers(args: {
  escalationId: string
  capability: string
  title: string
  severity: EscalationSeverity
}): Promise<number> {
  const approvers = await queryRows<{ id: string }>(
    `SELECT id FROM team_members WHERE is_active = true AND role = ANY($1)`,
    [AUTOMATION_ROLES],
  )
  let notified = 0
  for (const a of approvers) {
    try {
      await createNotification(escalationNotificationParams({
        approverId: a.id,
        escalationId: args.escalationId,
        capability: args.capability,
        title: args.title,
        severity: args.severity,
      }))
      notified++
    } catch (err) {
      console.error('[ops-autopilot] failed to notify escalation approver', a.id, err)
    }
  }
  return notified
}
