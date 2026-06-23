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
