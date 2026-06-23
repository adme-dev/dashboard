// Pure decision + format logic for C7 (actioned-confirmation loop). No DB, no side effects.
import type { EscalationInput } from '~~/server/utils/automation/escalations'

export interface BriefForC7 {
  id: string
  title: string | null
  submitted_by: string | null
  submitted_at: string | null
  assigned_to: string | null
  assignee_name: string | null
  client_id: string | null
  converted_to_task_id: string | null
  converted_to_project_id: string | null
  requested_deadline: string | null
  c7_acknowledged_at: string | null
  c7_stall_alerted_at: string | null
}

export function isC7Enabled(): boolean {
  return process.env.C7_CONFIRMATION_ENABLED === 'true'
}

export function addWorkingDays(from: Date, n: number): Date {
  const d = new Date(from.getTime())
  let added = 0
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1)
    const day = d.getUTCDay() // 0=Sun, 6=Sat
    if (day !== 0 && day !== 6) added++
  }
  return d
}

export function isStalled(b: BriefForC7, now: Date, slaWorkingDays = 1): boolean {
  if (b.c7_acknowledged_at || b.c7_stall_alerted_at) return false
  if (b.assigned_to || b.converted_to_task_id || b.converted_to_project_id) return false
  if (!b.submitted_at) return false
  const submitted = new Date(b.submitted_at)
  if (Number.isNaN(submitted.getTime())) return false
  let due = addWorkingDays(submitted, slaWorkingDays)
  if (b.requested_deadline) {
    const dl = new Date(b.requested_deadline)
    if (!Number.isNaN(dl.getTime()) && dl < due) due = dl
  }
  return now > due
}

export interface AckParams {
  userId: string
  type: 'brief_actioned'
  title: string
  message: string
  link: string
  reason: 'direct'
}

export function isFirstAction(b: BriefForC7): boolean {
  if (b.c7_acknowledged_at) return false
  return Boolean(b.assigned_to || b.converted_to_task_id || b.converted_to_project_id)
}

function withSuggestion(base: string, suggestion?: string): string {
  return suggestion ? `${base}\n\nSuggested next step: ${suggestion}` : base
}

export function ackNotification(b: BriefForC7, suggestion?: string): AckParams | null {
  if (!b.submitted_by) return null
  const title = b.title || 'Your brief'
  const base = b.assigned_to
    ? `Your brief "${title}" has been picked up${b.assignee_name ? ` by ${b.assignee_name}` : ''}.`
    : `Your brief "${title}" is now in the production pipeline.`
  return { userId: b.submitted_by, type: 'brief_actioned', title: 'Brief actioned', message: withSuggestion(base, suggestion), link: `/agency/briefs/${b.id}`, reason: 'direct' }
}

export function stallEscalation(b: BriefForC7, suggestion?: string): { escalation: EscalationInput, briefer: AckParams | null } {
  const title = b.title || 'Untitled brief'
  const escalation: EscalationInput = {
    capability: 'brief_sla',
    title: `Brief SLA breach: ${title}`,
    severity: 'warning',
    clientId: b.client_id ?? null,
    detail: { briefId: b.id, submittedAt: b.submitted_at, requestedDeadline: b.requested_deadline },
    proposedAction: null,
    assignedRole: 'AUTOMATION'
  }
  const briefer: AckParams | null = b.submitted_by
    ? { userId: b.submitted_by, type: 'brief_actioned', title: 'Brief not actioned', message: withSuggestion(`Brief "${title}" hasn't been actioned yet.`, suggestion), link: `/agency/briefs/${b.id}`, reason: 'direct' }
    : null
  return { escalation, briefer }
}
