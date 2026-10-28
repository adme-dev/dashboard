/**
 * Marketing department work management over MCP: client-scoped task and brief reads and
 * acknowledged mutations. Every call re-resolves fresh MARKETING_MANAGEMENT + department grant,
 * the active client, the exact project/task/brief relationship and board authority. Mutations
 * claim the exact input in the execution ledger, commit the record change and its activity row
 * atomically, then run the same post-commit fan-out as the browser routes. Billing/cost fields
 * are never read or written here.
 */
import type { z } from 'zod'
import { queryRowsFresh, transaction } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'
import { departmentWorkContracts, DEPARTMENT_WORK_WRITE_NAMES, type DepartmentWorkToolName } from './departmentWorkSchemas'
import {
  claimExecution, claimOutcome, finishExecution, refuse, refusalOf, sha256, validExecutionIdentity,
  type ExecutionIdentity, type LedgerDb
} from './departmentExecutionLedger'

type Args<N extends DepartmentWorkToolName> = z.infer<(typeof departmentWorkContracts)[N]>
type Effect = () => Promise<unknown> | unknown
interface Work { result: Record<string, unknown>, effects: Effect[] }

const WRITES = new Set<string>(DEPARTMENT_WORK_WRITE_NAMES)

async function authorize(ctx: ToolContext, clientId: string, write: boolean): Promise<ToolContext> {
  const fresh = await requireMarketingDepartment(ctx, write)
  await requireScopedClient(await resolveMarketingReadScope(fresh), clientId)
  return fresh
}

/** Board manager or member only. Unlike requireBoardAccess there is no role bypass: department access never widens to private boards. */
function boardAuthority(column: string, params: unknown[], ctx: ToolContext): string {
  if (!/^[a-z_]+\.[a-z_]+$/.test(column)) throw new Error('Invalid board column')
  params.push(ctx.userId)
  const actor = params.length
  return `EXISTS (SELECT 1 FROM departments auth_board WHERE auth_board.id = ${column}
    AND (auth_board.manager_id = $${actor}::uuid OR EXISTS (SELECT 1 FROM department_members auth_member
      WHERE auth_member.department_id = auth_board.id AND auth_member.team_member_id = $${actor}::uuid)))`
}
function boardMember(memberColumn: string, boardColumn: string): string {
  return `(EXISTS (SELECT 1 FROM department_members bm WHERE bm.department_id = ${boardColumn} AND bm.team_member_id = ${memberColumn})
    OR EXISTS (SELECT 1 FROM departments bmgr WHERE bmgr.id = ${boardColumn} AND bmgr.manager_id = ${memberColumn}))`
}
function page<T extends { id: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  return { items, nextCursor: rows.length > limit ? items.at(-1)!.id : null, complete: rows.length <= limit }
}

// ---------------------------------------------------------------------------------------- reads

async function workOptions(args: Args<'marketing_get_work_options'>, ctx: ToolContext) {
  const boardParams: unknown[] = []
  const boardAuth = boardAuthority('d.id', boardParams, ctx)
  const boards = await queryRowsFresh<{ id: string, name: string }>(`SELECT d.id, d.name FROM departments d
    WHERE COALESCE(d.is_active, TRUE) AND d.name NOT ILIKE 'Subitems of %' AND ${boardAuth}
    ORDER BY d.sort_order NULLS LAST, d.name, d.id LIMIT 201`, boardParams)
  const projects = await queryRowsFresh<{ id: string, name: string, status: string }>(`SELECT p.id, p.name, p.status
    FROM projects p JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
    WHERE p.client_id = $1 AND COALESCE(p.status, 'draft') <> 'cancelled' ORDER BY p.name, p.id LIMIT 201`, [args.clientId])
  let board: Record<string, unknown> | null = null
  if (args.boardId) {
    if (!boards.some(b => b.id === args.boardId)) return fail('Board not available', 'not_found')
    const [statuses, members] = await Promise.all([
      queryRowsFresh(`SELECT id, name, category, COALESCE(is_default, FALSE) AS is_default, COALESCE(is_final, FALSE) AS is_final
        FROM task_statuses WHERE department_id IS NULL OR department_id = $1 ORDER BY sort_order, name, id`, [args.boardId]),
      queryRowsFresh(`SELECT tm.id, tm.name FROM team_members tm WHERE tm.is_active = TRUE AND ${boardMember('tm.id', '$1::uuid')}
        ORDER BY tm.name, tm.id LIMIT 201`, [args.boardId])
    ])
    board = { boardId: args.boardId, statuses, assignableMembers: members.slice(0, 200), membersComplete: members.length <= 200 }
  }
  return ok({
    clientId: args.clientId,
    boards: boards.slice(0, 200), boardsComplete: boards.length <= 200,
    projects: projects.slice(0, 200), projectsComplete: projects.length <= 200,
    board,
    note: 'Tasks belong to a client through their project. Boards listed are those you can access.'
  })
}

async function listTasks(args: Args<'marketing_list_work_tasks'>, ctx: ToolContext) {
  const params: unknown[] = [args.clientId]
  const where = ['p.client_id = $1', boardAuthority('t.department_id', params, ctx)]
  const add = (sql: string, value: unknown) => {
    params.push(value)
    where.push(sql.replace('?', `$${params.length}`))
  }
  if (args.boardId) add('t.department_id = ?::uuid', args.boardId)
  if (args.projectId) add('t.project_id = ?::uuid', args.projectId)
  if (args.assigneeId) add('t.assignee_id = ?::uuid', args.assigneeId)
  if (!args.includeCompleted) where.push('COALESCE(t.status_is_final, FALSE) = FALSE')
  if (args.afterId) add('t.id > ?::uuid', args.afterId)
  params.push(args.limit + 1)
  const rows = await queryRowsFresh<Record<string, unknown> & { id: string }>(`SELECT t.id, t.title, LEFT(t.description, 2000) AS description,
      t.department_id AS board_id, d.name AS board_name, t.project_id, p.name AS project_name, t.parent_task_id,
      t.status_id, ts.name AS status_name, ts.category AS status_category, COALESCE(t.status_is_final, FALSE) AS status_is_final,
      t.priority, t.assignee_id, tm.name AS assignee_name, t.due_date::text AS due_date, t.start_date::text AS start_date,
      COALESCE(t.is_blocked, FALSE) AS is_blocked, t.blocked_reason, t.brief_id, t.version, t.updated_at
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
    JOIN departments d ON d.id = t.department_id
    LEFT JOIN task_statuses ts ON ts.id = t.status_id
    LEFT JOIN team_members tm ON tm.id = t.assignee_id
    WHERE ${where.join(' AND ')}
    ORDER BY t.id LIMIT $${params.length}`, params)
  return ok({ clientId: args.clientId, ...page(rows, args.limit), storedOnly: true })
}

async function listBriefs(args: Args<'marketing_list_work_briefs'>, ctx: ToolContext) {
  const params: unknown[] = [args.clientId]
  const where = ['b.client_id = $1', `(b.department_id IS NULL OR ${boardAuthority('b.department_id', params, ctx)})`]
  if (args.status) {
    params.push(args.status)
    where.push(`b.status = $${params.length}`)
  }
  if (args.afterId) {
    params.push(args.afterId)
    where.push(`b.id > $${params.length}::uuid`)
  }
  params.push(args.limit + 1)
  // Budgets, submitter contact details and request metadata are deliberately excluded.
  const rows = await queryRowsFresh<Record<string, unknown> & { id: string }>(`SELECT b.id, b.reference_number, b.title, b.status, b.priority,
      b.department_id AS board_id, b.project_id, b.assigned_to, tm.name AS assigned_to_name,
      b.requested_deadline::text AS requested_deadline, b.converted_to_task_id, b.converted_to_project_id, b.updated_at
    FROM briefs b
    JOIN agency_clients c ON c.id = b.client_id AND c.is_active = TRUE
    LEFT JOIN team_members tm ON tm.id = b.assigned_to
    WHERE ${where.join(' AND ')}
    ORDER BY b.id LIMIT $${params.length}`, params)
  return ok({
    clientId: args.clientId, ...page(rows, args.limit), storedOnly: true,
    supportedStatusTransitions: 'submitted→under_review|needs_info, under_review→needs_info, approved→in_progress, in_progress→completed; approval, rejection and cancellation stay in the application'
  })
}

// ------------------------------------------------------------------------------------ mutations

interface TaskRow {
  id: string
  title: string
  department_id: string
  project_id: string
  assignee_id: string | null
  reporter_id: string | null
  status_id: string
  old_status_name: string
  version: number
  description: string | null
  priority: string | null
  due_date: string | null
  start_date: string | null
  is_blocked: boolean | null
  blocked_reason: string | null
}

async function lockTask(db: LedgerDb, ctx: ToolContext, clientId: string, taskId: string, expectedVersion: number): Promise<TaskRow> {
  const params: unknown[] = [taskId, clientId]
  const auth = boardAuthority('t.department_id', params, ctx)
  const task = (await db.query(`SELECT t.id, t.title, t.department_id, t.project_id, t.assignee_id, t.reporter_id, t.status_id,
      COALESCE(ts.name, '') AS old_status_name, t.version, t.description, t.priority, t.due_date::text AS due_date,
      t.start_date::text AS start_date, t.is_blocked, t.blocked_reason
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
    LEFT JOIN task_statuses ts ON ts.id = t.status_id
    WHERE t.id = $1 AND p.client_id = $2 AND ${auth}
    FOR UPDATE OF t`, params)).rows[0] as TaskRow | undefined
  if (!task) refuse('Task not available for this client', 'not_found')
  if (Number(task.version ?? 1) !== expectedVersion) refuse('Task changed since it was read; reload before applying', 'conflict')
  return task
}

async function requireAssignableMember(db: LedgerDb, memberId: string, boardId: string | null) {
  const member = (await db.query(`SELECT tm.id, tm.name FROM team_members tm WHERE tm.id = $1 AND tm.is_active = TRUE
    AND ($2::uuid IS NULL OR ${boardMember('tm.id', '$2::uuid')})`, [memberId, boardId])).rows[0] as { id: string, name: string } | undefined
  if (!member) refuse(boardId ? 'Assignee must be an active member of this board' : 'Assignee must be an active team member', 'bad_args')
  return member
}

async function createTask(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_create_work_task'>): Promise<Work> {
  if (args.startDate && args.dueDate && args.startDate > args.dueDate) refuse('startDate must not be after dueDate', 'bad_args')
  const project = (await db.query(`SELECT p.id FROM projects p JOIN agency_clients c ON c.id = p.client_id AND c.is_active = TRUE
    WHERE p.id = $1 AND p.client_id = $2 AND COALESCE(p.status, 'draft') <> 'cancelled' FOR SHARE OF p`, [args.projectId, args.clientId])).rows[0]
  if (!project) refuse('Project not available for this client', 'not_found')
  const boardParams: unknown[] = [args.boardId]
  const board = (await db.query(`SELECT d.id FROM departments d WHERE d.id = $1 AND COALESCE(d.is_active, TRUE)
    AND ${boardAuthority('d.id', boardParams, ctx)}`, boardParams)).rows[0]
  if (!board) refuse('Board not available', 'not_found')
  const status = (await db.query(args.statusId
    ? `SELECT id, name FROM task_statuses WHERE id = $2 AND (department_id IS NULL OR department_id = $1)`
    : `SELECT id, name FROM task_statuses WHERE (department_id IS NULL OR department_id = $1) AND is_default = TRUE
       ORDER BY department_id NULLS LAST LIMIT 1`, args.statusId ? [args.boardId, args.statusId] : [args.boardId])).rows[0]
  if (!status) refuse(args.statusId ? 'Invalid status for this board' : 'No default status for this board', 'bad_args')
  const assignee = args.assigneeId ? await requireAssignableMember(db, args.assigneeId, args.boardId) : null
  if (args.briefId) {
    const brief = (await db.query(`SELECT id FROM briefs WHERE id = $1 AND client_id = $2`, [args.briefId, args.clientId])).rows[0]
    if (!brief) refuse('Brief not available for this client', 'not_found')
  }
  const task = (await db.query(`INSERT INTO tasks (
      department_id, project_id, status_id, title, description, priority, task_type,
      assignee_id, reporter_id, due_date, start_date, brief_id, budget_source, last_modified_by
    ) VALUES ($1, $2, $3, $4, $5, $6, 'task', $7, $8, $9, $10, $11, 'manual', $8)
    RETURNING id, title, department_id, version, due_date::text AS due_date`, [
    args.boardId, args.projectId, status.id, args.title, args.description || null, args.priority,
    assignee?.id ?? null, ctx.userId, args.dueDate ?? null, args.startDate ?? null, args.briefId ?? null
  ])).rows[0] as { id: string, title: string, department_id: string, version: number, due_date: string | null }
  await db.query(`INSERT INTO task_activities (task_id, user_id, activity_type, content)
    VALUES ($1, $2, 'created', $3)`, [task.id, ctx.userId, `Created task "${task.title}" via marketing MCP`])
  const effects: Effect[] = [async () => (await import('~~/server/utils/subscriptions')).autoSubscribeIfEnabled(ctx.userId, args.boardId, task.id)]
  if (assignee && assignee.id !== ctx.userId) {
    effects.push(async () => (await import('~~/server/utils/notifications')).notifyTaskAssigned({
      assigneeId: assignee.id, taskId: task.id, taskTitle: task.title, assignerId: ctx.userId,
      dueDate: task.due_date ? new Date(task.due_date) : undefined
    }))
  }
  return {
    result: { taskId: task.id, clientId: args.clientId, boardId: args.boardId, projectId: args.projectId, statusId: status.id, assigneeId: assignee?.id ?? null, version: Number(task.version ?? 1) },
    effects
  }
}

const TASK_FIELDS = {
  title: 'title', description: 'description', priority: 'priority', dueDate: 'due_date',
  startDate: 'start_date', isBlocked: 'is_blocked', blockedReason: 'blocked_reason'
} as const

async function updateTask(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_update_work_task'>, event: ToolContext['event']): Promise<Work> {
  const task = await lockTask(db, ctx, args.clientId, args.taskId, args.expectedVersion)
  const changes: Array<{ field: string, column: string, oldValue: unknown, newValue: unknown }> = []
  for (const [key, column] of Object.entries(TASK_FIELDS) as Array<[keyof typeof TASK_FIELDS, string]>) {
    if (!(key in args.patch)) continue
    const raw = args.patch[key]
    const newValue = typeof raw === 'string' ? (raw === '' && key !== 'title' ? null : raw) : raw ?? null
    const oldValue = (task as unknown as Record<string, unknown>)[column] ?? null
    if ((key === 'isBlocked' ? Boolean(oldValue) : oldValue) !== newValue) changes.push({ field: column, column, oldValue, newValue })
  }
  const next = (column: string, current: unknown) => {
    const change = changes.find(c => c.column === column)
    return change ? change.newValue : current
  }
  const [nextStart, nextDue] = [next('start_date', task.start_date), next('due_date', task.due_date)]
  if (nextStart && nextDue && String(nextStart) > String(nextDue)) refuse('startDate must not be after dueDate', 'bad_args')
  if (!changes.length) return { result: { taskId: task.id, unchanged: true, version: Number(task.version) }, effects: [] }
  const values: unknown[] = [task.id, ctx.userId]
  const sets = changes.map((change) => {
    values.push(change.newValue)
    return `${change.column} = $${values.length}`
  })
  const updated = (await db.query(`UPDATE tasks SET ${sets.join(', ')}, updated_at = NOW(), last_modified_by = $2
    WHERE id = $1 RETURNING version`, values)).rows[0] as { version: number }
  for (const change of changes) {
    await db.query(`INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
      VALUES ($1, $2, 'updated', $3, $4, $5)`, [task.id, ctx.userId, `Changed ${change.field}`, JSON.stringify(change.oldValue), JSON.stringify(change.newValue)])
  }
  const changed = Object.fromEntries(changes.map(c => [c.field, c.newValue]))
  return {
    result: { taskId: task.id, changedFields: changes.map(c => c.field), version: Number(updated.version) },
    effects: [async () => (await import('~~/server/utils/workManagement/taskEffects')).dispatchTaskFieldUpdateEffects(event, {
      boardId: task.department_id, taskId: task.id, taskTitle: task.title, actorUserId: ctx.userId, changes: changed
    })]
  }
}

async function assignTask(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_assign_work_task'>): Promise<Work> {
  const task = await lockTask(db, ctx, args.clientId, args.taskId, args.expectedVersion)
  if (task.assignee_id === args.assigneeId) return { result: { taskId: task.id, unchanged: true, assigneeId: task.assignee_id, version: Number(task.version) }, effects: [] }
  const assignee = args.assigneeId ? await requireAssignableMember(db, args.assigneeId, task.department_id) : null
  const old = task.assignee_id
    ? (await db.query('SELECT name FROM team_members WHERE id = $1', [task.assignee_id])).rows[0]?.name ?? null
    : null
  const updated = (await db.query(`UPDATE tasks SET assignee_id = $2, updated_at = NOW(), last_modified_by = $3
    WHERE id = $1 RETURNING version`, [task.id, assignee?.id ?? null, ctx.userId])).rows[0] as { version: number }
  const content = assignee
    ? old ? `Reassigned from "${old}" to "${assignee.name}"` : `Assigned to "${assignee.name}"`
    : `Unassigned from "${old}"`
  await db.query(`INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
    VALUES ($1, $2, 'assignment', $3, $4, $5)`, [task.id, ctx.userId, content,
    JSON.stringify({ assigneeId: task.assignee_id, assigneeName: old }), JSON.stringify({ assigneeId: assignee?.id ?? null, assigneeName: assignee?.name ?? null })])
  const effects: Effect[] = [async () => (await import('~~/server/utils/notifications')).notifyTaskAssigneeChanged({
    taskId: task.id, taskTitle: task.title, oldAssigneeId: task.assignee_id, newAssigneeId: assignee?.id ?? null,
    actorId: ctx.userId, dueDate: task.due_date ? new Date(task.due_date) : undefined
  })]
  if (assignee) effects.unshift(async () => (await import('~~/server/utils/subscriptions')).autoSubscribe(assignee.id, task.department_id, task.id))
  return { result: { taskId: task.id, assigneeId: assignee?.id ?? null, previousAssigneeId: task.assignee_id, version: Number(updated.version) }, effects }
}

async function setTaskStatus(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_set_work_task_status'>, event: ToolContext['event']): Promise<Work> {
  const task = await lockTask(db, ctx, args.clientId, args.taskId, args.expectedVersion)
  const status = (await db.query(`SELECT id, name, COALESCE(is_final, FALSE) AS is_final FROM task_statuses
    WHERE id = $1 AND (department_id IS NULL OR department_id = $2)`, [args.statusId, task.department_id])).rows[0] as { id: string, name: string, is_final: boolean } | undefined
  if (!status) refuse('Invalid status ID for this board', 'bad_args')
  if (task.status_id === status.id) return { result: { taskId: task.id, unchanged: true, statusId: status.id, version: Number(task.version) }, effects: [] }
  const updated = (await db.query(`UPDATE tasks SET status_id = $2, completed_at = CASE WHEN $4::boolean THEN NOW() ELSE NULL END,
    updated_at = NOW(), last_modified_by = $3 WHERE id = $1 RETURNING version`, [task.id, status.id, ctx.userId, status.is_final])).rows[0] as { version: number }
  await db.query(`INSERT INTO task_activities (task_id, user_id, activity_type, content, old_value, new_value)
    VALUES ($1, $2, 'status_change', $3, $4, $5)`, [task.id, ctx.userId,
    `Changed status from "${task.old_status_name}" to "${status.name}"`,
    JSON.stringify({ statusId: task.status_id, statusName: task.old_status_name }), JSON.stringify({ statusId: status.id, statusName: status.name })])
  return {
    result: { taskId: task.id, statusId: status.id, previousStatusId: task.status_id, isFinal: status.is_final, version: Number(updated.version) },
    effects: [async () => (await import('~~/server/utils/workManagement/taskEffects')).dispatchTaskStatusChangeEffects(event, {
      task, newStatus: status, actorUserId: ctx.userId
    })]
  }
}

interface BriefRow { id: string, title: string, reference_number: string, assigned_to: string | null, status: string, department_id: string | null }
async function lockBrief(db: LedgerDb, ctx: ToolContext, clientId: string, briefId: string): Promise<BriefRow> {
  const params: unknown[] = [briefId, clientId]
  const auth = boardAuthority('b.department_id', params, ctx)
  const brief = (await db.query(`SELECT b.id, b.title, b.reference_number, b.assigned_to, b.status, b.department_id
    FROM briefs b JOIN agency_clients c ON c.id = b.client_id AND c.is_active = TRUE
    WHERE b.id = $1 AND b.client_id = $2 AND (b.department_id IS NULL OR ${auth}) FOR UPDATE OF b`, params)).rows[0] as BriefRow | undefined
  if (!brief) refuse('Brief not available for this client', 'not_found')
  return brief
}

async function assignBrief(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_assign_work_brief'>): Promise<Work> {
  const brief = await lockBrief(db, ctx, args.clientId, args.briefId)
  if (brief.assigned_to !== args.expectedAssigneeId) refuse('Brief assignment changed since it was read; reload before applying', 'conflict')
  if (brief.assigned_to === args.assigneeId) return { result: { briefId: brief.id, unchanged: true, assigneeId: brief.assigned_to }, effects: [] }
  const assignee = await requireAssignableMember(db, args.assigneeId, brief.department_id)
  await db.query(`UPDATE briefs SET assigned_to = $2, assigned_at = NOW(), updated_at = NOW() WHERE id = $1`, [brief.id, assignee.id])
  await db.query(`INSERT INTO brief_watchers (brief_id, user_id) VALUES ($1, $2) ON CONFLICT (brief_id, user_id) DO NOTHING`, [brief.id, assignee.id])
  await db.query(`INSERT INTO brief_activities (brief_id, user_id, activity_type, old_value, new_value, content)
    VALUES ($1, $2, 'assigned', $3, $4, $5)`, [brief.id, ctx.userId, JSON.stringify({ assigneeId: brief.assigned_to }),
    JSON.stringify({ assigneeId: assignee.id, assigneeName: assignee.name }), `Assigned to ${assignee.name} via marketing MCP`])
  return {
    result: { briefId: brief.id, assigneeId: assignee.id, previousAssigneeId: brief.assigned_to },
    effects: [
      async () => (await import('~~/server/utils/briefNotifications')).notifyBriefAssigneeChanged({
        briefId: brief.id, briefTitle: brief.title, referenceNumber: brief.reference_number,
        oldAssigneeId: brief.assigned_to, newAssigneeId: assignee.id, actorId: ctx.userId
      }),
      async () => (await import('~~/server/utils/automation/actionedConfirmationRunner')).maybeAcknowledgeBrief(brief.id)
    ]
  }
}

async function setBriefStatus(db: LedgerDb, ctx: ToolContext, args: Args<'marketing_set_work_brief_status'>): Promise<Work> {
  const brief = await lockBrief(db, ctx, args.clientId, args.briefId)
  if (brief.status !== args.expectedStatus) refuse('Brief status changed since it was read; reload before applying', 'conflict')
  await db.query(`UPDATE briefs SET status = $2, updated_at = NOW()${args.status === 'completed' ? ', completed_at = NOW()' : ''}
    WHERE id = $1`, [brief.id, args.status])
  const activity = args.status === 'needs_info' ? 'needs_info' : args.status === 'completed' ? 'completed' : 'status_changed'
  await db.query(`INSERT INTO brief_activities (brief_id, user_id, activity_type, old_value, new_value, content)
    VALUES ($1, $2, $3, $4, $5, $6)`, [brief.id, ctx.userId, activity, JSON.stringify({ status: brief.status }),
    JSON.stringify({ status: args.status }), args.note])
  return {
    result: { briefId: brief.id, status: args.status, previousStatus: brief.status },
    effects: [async () => (await import('~~/server/utils/briefNotifications')).notifyBriefStatusChanged({
      briefId: brief.id, briefTitle: brief.title, referenceNumber: brief.reference_number,
      oldStatus: brief.status, newStatus: args.status, actorId: ctx.userId
    })]
  }
}

async function runEffects(effects: Effect[]) {
  for (const effect of effects) {
    try {
      await effect()
    } catch (error) {
      console.error('[department-work] post-commit effect failed:', (error as Error)?.message)
    }
  }
}

async function mutate(name: DepartmentWorkToolName, args: { clientId: string }, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  const fresh = await authorize(ctx, args.clientId, true)
  const identity: ExecutionIdentity = {
    actorId: fresh.userId, key, digest, tool: name, clientId: args.clientId,
    inputHash: sha256({ name, args }), executor: 'local-transactional'
  }
  let effects: Effect[] = []
  const outcome = await transaction(async (pool) => {
    const db = pool as unknown as LedgerDb
    const claim = await claimExecution(db, identity)
    if (claim.kind !== 'fresh') return claimOutcome(claim)
    const work = name === 'marketing_create_work_task'
      ? await createTask(db, fresh, args as Args<typeof name>)
      : name === 'marketing_update_work_task'
        ? await updateTask(db, fresh, args as Args<typeof name>, ctx.event)
        : name === 'marketing_assign_work_task'
          ? await assignTask(db, fresh, args as Args<typeof name>)
          : name === 'marketing_set_work_task_status'
            ? await setTaskStatus(db, fresh, args as Args<typeof name>, ctx.event)
            : name === 'marketing_assign_work_brief'
              ? await assignBrief(db, fresh, args as Args<typeof name>)
              : await setBriefStatus(db, fresh, args as Args<'marketing_set_work_brief_status'>)
    await finishExecution(db, identity, work.result)
    effects = work.effects
    return ok({ ...work.result, committed: true })
  })
  // Only a fresh commit fans out; replays and refusals never repeat notifications or automations.
  if (outcome.ok && !(outcome.data as { replayed?: boolean }).replayed) await runEffects(effects)
  return outcome
}

export async function runDepartmentWorkOperation(
  name: string, raw: unknown, ctx: ToolContext, key?: string, digest?: string
): Promise<ToolResult> {
  const contract = departmentWorkContracts[name as DepartmentWorkToolName]
  if (!contract) return fail('Unknown department work operation', 'not_found')
  const parsed = contract.safeParse(raw)
  if (!parsed.success) return fail('Invalid department work arguments', 'bad_args')
  const args = parsed.data as { clientId: string }
  try {
    if (WRITES.has(name)) {
      if (!validExecutionIdentity(key, digest)) return fail('Verified logical request identity required', 'coordinator_required')
      return await mutate(name as DepartmentWorkToolName, args, ctx, key, digest!)
    }
    const fresh = await authorize(ctx, args.clientId, false)
    if (name === 'marketing_get_work_options') return await workOptions(args as Args<'marketing_get_work_options'>, fresh)
    if (name === 'marketing_list_work_tasks') return await listTasks(args as Args<'marketing_list_work_tasks'>, fresh)
    return await listBriefs(args as Args<'marketing_list_work_briefs'>, fresh)
  } catch (error) {
    const refusal = refusalOf(error)
    if (refusal) return refusal
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 403) return fail('Not permitted for this marketing department request', 'forbidden')
    if (status === 404) return fail('Client not available', 'not_found')
    return fail('Department work operation unavailable', 'unavailable')
  }
}
