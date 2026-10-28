// Dependency-free (zod only): imported by policy/projection without loading executable services.
import { z } from 'zod'

export const DEPARTMENT_WORK_READ_NAMES = [
  'marketing_get_work_options', 'marketing_list_work_tasks', 'marketing_list_work_briefs'
] as const
export const DEPARTMENT_WORK_WRITE_NAMES = [
  'marketing_create_work_task', 'marketing_update_work_task', 'marketing_assign_work_task',
  'marketing_set_work_task_status', 'marketing_assign_work_brief', 'marketing_set_work_brief_status'
] as const
export type DepartmentWorkToolName = typeof DEPARTMENT_WORK_READ_NAMES[number] | typeof DEPARTMENT_WORK_WRITE_NAMES[number]

const uuid = z.string().uuid()
const isoDate = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Use YYYY-MM-DD')
const title = z.string().trim().min(1).max(255)
const description = z.string().trim().max(10000)
const priority = z.enum(['urgent', 'high', 'medium', 'low'])
const limit = z.number().int().min(1).max(100).default(50)
const version = z.number().int().min(1)
const client = { clientId: uuid }

/** Brief transitions that carry no approval, project-conversion or quote/billing side effect. */
export const BRIEF_STATUS_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  submitted: ['under_review', 'needs_info'],
  under_review: ['needs_info'],
  approved: ['in_progress'],
  in_progress: ['completed']
})
export const DEPARTMENT_BRIEF_TARGET_STATUSES = ['under_review', 'needs_info', 'in_progress', 'completed'] as const

export const departmentWorkContracts = {
  marketing_get_work_options: z.strictObject({ ...client, boardId: uuid.optional() }),
  marketing_list_work_tasks: z.strictObject({
    ...client,
    boardId: uuid.optional(),
    projectId: uuid.optional(),
    assigneeId: uuid.optional(),
    includeCompleted: z.boolean().default(false),
    afterId: uuid.optional(),
    limit
  }),
  marketing_list_work_briefs: z.strictObject({
    ...client,
    status: z.enum(['draft', 'submitted', 'under_review', 'needs_info', 'approved', 'rejected', 'in_progress', 'completed', 'cancelled']).optional(),
    afterId: uuid.optional(),
    limit
  }),
  marketing_create_work_task: z.strictObject({
    ...client,
    projectId: uuid,
    boardId: uuid,
    title,
    description: description.optional(),
    priority: priority.default('medium'),
    statusId: uuid.optional(),
    assigneeId: uuid.optional(),
    briefId: uuid.optional(),
    dueDate: isoDate.optional(),
    startDate: isoDate.optional(),
    acknowledgement: z.literal('CREATE_CLIENT_TASK')
  }).refine(v => !v.dueDate || !v.startDate || v.startDate <= v.dueDate, 'startDate must not be after dueDate'),
  marketing_update_work_task: z.strictObject({
    ...client,
    taskId: uuid,
    expectedVersion: version,
    patch: z.strictObject({
      title: title.optional(),
      description: description.nullable().optional(),
      priority: priority.optional(),
      dueDate: isoDate.nullable().optional(),
      startDate: isoDate.nullable().optional(),
      isBlocked: z.boolean().optional(),
      blockedReason: z.string().trim().max(1000).nullable().optional()
    }).refine(p => Object.keys(p).length > 0, 'Patch must change at least one field'),
    acknowledgement: z.literal('UPDATE_CLIENT_TASK')
  }),
  marketing_assign_work_task: z.strictObject({
    ...client,
    taskId: uuid,
    expectedVersion: version,
    assigneeId: uuid.nullable(),
    acknowledgement: z.literal('ASSIGN_CLIENT_TASK')
  }),
  marketing_set_work_task_status: z.strictObject({
    ...client,
    taskId: uuid,
    expectedVersion: version,
    statusId: uuid,
    acknowledgement: z.literal('CHANGE_CLIENT_TASK_STATUS')
  }),
  marketing_assign_work_brief: z.strictObject({
    ...client,
    briefId: uuid,
    expectedAssigneeId: uuid.nullable(),
    assigneeId: uuid,
    acknowledgement: z.literal('ASSIGN_CLIENT_BRIEF')
  }),
  marketing_set_work_brief_status: z.strictObject({
    ...client,
    briefId: uuid,
    expectedStatus: z.enum(['submitted', 'under_review', 'approved', 'in_progress']),
    status: z.enum(DEPARTMENT_BRIEF_TARGET_STATUSES),
    note: z.string().trim().min(1).max(2000),
    acknowledgement: z.literal('CHANGE_CLIENT_BRIEF_STATUS')
  }).refine(v => BRIEF_STATUS_TRANSITIONS[v.expectedStatus]?.includes(v.status), 'Unsupported brief transition')
} satisfies Record<DepartmentWorkToolName, z.ZodTypeAny>
