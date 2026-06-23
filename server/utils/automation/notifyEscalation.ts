// server/utils/automation/notifyEscalation.ts
import { queryRows } from '~~/server/utils/db'
import { createNotification } from '~~/server/utils/notifications'
import { escalationNotificationParams, type EscalationSeverity } from '~~/server/utils/automation/escalations'

// Roles in the AUTOMATION permission group (see server/utils/permissions.ts).
const AUTOMATION_ROLES = ['owner', 'admin', 'lead', 'project_manager']

/**
 * Parse the optional OPS_AUTOPILOT_NOTIFY_ALLOWLIST env (comma-separated emails).
 * When set, ONLY these addresses receive escalation notifications, regardless of
 * role — the same gradual-rollout safety as ANOMALY_NOTIFY_ALLOWLIST. Use it when
 * first activating a capability (e.g. C1 pacing, whose always-critical issues would
 * otherwise email every AUTOMATION user on the first cron run). Unset/empty = full
 * fan-out to all active AUTOMATION-role members.
 */
export function parseNotifyAllowlist(raw: string | undefined): Set<string> | null {
  if (!raw || !raw.trim()) return null
  const emails = raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return emails.length > 0 ? new Set(emails) : null
}

/** Cap recipients to the allowlist (case-insensitive). Null allowlist = passthrough. */
export function applyNotifyAllowlist<T extends { email: string | null }>(
  recipients: T[],
  allowlist: Set<string> | null
): T[] {
  if (!allowlist) return recipients
  return recipients.filter(r => r.email != null && allowlist.has(r.email.toLowerCase()))
}

export async function notifyEscalationApprovers(args: {
  escalationId: string
  capability: string
  title: string
  severity: EscalationSeverity
}): Promise<number> {
  const approvers = await queryRows<{ id: string, email: string | null }>(
    `SELECT id, email FROM team_members WHERE is_active = true AND role = ANY($1)`,
    [AUTOMATION_ROLES]
  )
  const recipients = applyNotifyAllowlist(approvers, parseNotifyAllowlist(process.env.OPS_AUTOPILOT_NOTIFY_ALLOWLIST))
  let notified = 0
  for (const a of recipients) {
    try {
      await createNotification(escalationNotificationParams({
        approverId: a.id,
        escalationId: args.escalationId,
        capability: args.capability,
        title: args.title,
        severity: args.severity
      }))
      notified++
    } catch (err) {
      console.error('[ops-autopilot] failed to notify escalation approver', a.id, err)
    }
  }
  return notified
}
