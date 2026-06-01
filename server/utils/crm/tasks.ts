// server/utils/crm/tasks.ts
// Pure helpers for CRM follow-up tasks: input validation, derived "overdue"
// status, and filter-condition building (feeds buildWhere from queryScope.ts).
import { z } from 'zod'
import type { Cond } from './queryScope'

export const TASK_TYPES = ['call', 'email', 'sms', 'meeting', 'follow_up', 'general'] as const
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const TASK_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const
export const TASK_OUTCOMES = [
  'contacted', 'voicemail', 'no_answer', 'rescheduled', 'converted', 'not_interested',
] as const

export const TaskCreateInput = z.object({
  client_id: z.string().uuid(),
  target_type: z.enum(['person', 'company', 'opportunity']),
  target_id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  task_type: z.enum(TASK_TYPES).default('follow_up'),
  priority: z.enum(TASK_PRIORITIES).default('medium'),
  due_at: z.string().datetime().nullable().optional(),
  reminder_at: z.string().datetime().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
})

export const TaskUpdateInput = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  task_type: z.enum(TASK_TYPES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  due_at: z.string().datetime().nullable().optional(),
  reminder_at: z.string().datetime().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  outcome: z.enum(TASK_OUTCOMES).nullable().optional(),
})

// "overdue" is never stored — it's derived at read time from a pending task whose
// due_at has passed. Completed/cancelled/in_progress are returned unchanged.
export function deriveStatus(task: { status: string, due_at: string | null }, now: Date): string {
  if (task.status === 'pending' && task.due_at && new Date(task.due_at) < now) return 'overdue'
  return task.status
}

export interface TaskFilterQuery {
  status?: string
  priority?: string
  task_type?: string
  assigned_to?: string
  target_type?: string
  target_id?: string
}

// Translates query params into Cond[] for buildWhere(). The pseudo-status
// "overdue" expands to (pending AND due_at < now); other statuses are equality.
export function buildTaskFilter(q: TaskFilterQuery, now: Date): Cond[] {
  const conds: Cond[] = []
  if (q.status === 'overdue') {
    conds.push({ sql: "status = 'pending'", params: [] })
    conds.push({ sql: 'due_at < ?', params: [now.toISOString()] })
  } else if (q.status) {
    conds.push({ sql: 'status = ?', params: [q.status] })
  }
  if (q.priority) conds.push({ sql: 'priority = ?', params: [q.priority] })
  if (q.task_type) conds.push({ sql: 'task_type = ?', params: [q.task_type] })
  if (q.assigned_to) conds.push({ sql: 'assigned_to = ?', params: [q.assigned_to] })
  if (q.target_type) conds.push({ sql: 'target_type = ?', params: [q.target_type] })
  if (q.target_id) conds.push({ sql: 'target_id = ?', params: [q.target_id] })
  return conds
}
