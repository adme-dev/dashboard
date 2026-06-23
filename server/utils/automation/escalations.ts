// server/utils/automation/escalations.ts
// Pure domain logic for the Ops Autopilot escalation spine. No I/O — unit-tested.

export type EscalationSeverity = 'info' | 'warning' | 'critical'
export type EscalationStatus = 'pending' | 'approved' | 'rejected' | 'auto_resolved' | 'expired'
export type EscalationDecision = 'approved' | 'rejected'

const SEVERITIES: EscalationSeverity[] = ['info', 'warning', 'critical']
const SEVERITY_RANK: Record<EscalationSeverity, number> = { critical: 0, warning: 1, info: 2 }

export interface EscalationInput {
  capability: string
  title: string
  severity?: EscalationSeverity
  clientId?: string | null
  runId?: string | null
  detail?: Record<string, any>
  proposedAction?: Record<string, any> | null
  assignedRole?: string
}

export interface EscalationInsert {
  capability: string
  title: string
  severity: EscalationSeverity
  client_id: string | null
  run_id: string | null
  detail: string
  proposed_action: string | null
  assigned_role: string
}

export function buildEscalationInsert(input: EscalationInput): EscalationInsert {
  const capability = (input.capability ?? '').trim()
  const title = (input.title ?? '').trim()
  if (!capability) throw new Error('escalation: capability is required')
  if (!title) throw new Error('escalation: title is required')
  const severity = input.severity && SEVERITIES.includes(input.severity) ? input.severity : 'warning'
  return {
    capability,
    title,
    severity,
    client_id: input.clientId ?? null,
    run_id: input.runId ?? null,
    detail: JSON.stringify(input.detail ?? {}),
    proposed_action: input.proposedAction ? JSON.stringify(input.proposedAction) : null,
    assigned_role: input.assignedRole ?? 'AUTOMATION',
  }
}

export function canDecide(status: EscalationStatus): boolean {
  return status === 'pending'
}

export function assertDecidable(status: EscalationStatus): void {
  if (!canDecide(status)) {
    throw new Error(`escalation is '${status}'; only 'pending' escalations can be decided`)
  }
}

export interface EscalationNotification {
  userId: string
  type: 'approval_requested'
  title: string
  message: string
  link: string
  metadata: Record<string, any>
}

export function escalationNotificationParams(args: {
  approverId: string
  escalationId: string
  capability: string
  title: string
  severity: EscalationSeverity
}): EscalationNotification {
  return {
    userId: args.approverId,
    type: 'approval_requested',
    title: `Automation needs approval: ${args.capability}`,
    message: args.title,
    link: `/agency/automation/escalations?escalation=${args.escalationId}`,
    metadata: {
      escalationId: args.escalationId,
      capability: args.capability,
      severity: args.severity,
      kind: 'automation_escalation',
    },
  }
}

export interface EscalationGroup {
  severity: EscalationSeverity
  clientId: string | null
  items: any[]
}

export function groupEscalations(rows: Array<{ severity: EscalationSeverity; client_id: string | null }>): EscalationGroup[] {
  const sorted = [...rows].sort((a, b) => {
    const s = (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3)
    if (s !== 0) return s
    return String(a.client_id ?? '').localeCompare(String(b.client_id ?? ''))
  })
  const groups: EscalationGroup[] = []
  for (const row of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.severity === row.severity && last.clientId === (row.client_id ?? null)) {
      last.items.push(row)
    } else {
      groups.push({ severity: row.severity, clientId: row.client_id ?? null, items: [row] })
    }
  }
  return groups
}
