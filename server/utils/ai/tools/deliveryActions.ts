import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult, isConversationlessProposeContext } from '../toolContext'
import { proposeAction } from '../pendingActions'
import { pickByExactName, type NamedRef } from './createTask'

/**
 * Delivery write tools (PRD §7 Account Manager + Producer/PM): assign/reassign a task, change a task's
 * status, and convert a brief into a project. All Option B — PROPOSE only; the confirm endpoint runs the
 * real mutation via the existing internal endpoints. Names resolve to ids server-side (the model never
 * supplies an id); ambiguous names return a `disambiguation` so the confirm card never renders on a guess.
 */

const ilike = (name: string) => `%${escapeLike(name)}%`

export type DeliveryDeps = {
  resolveTask: (title: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveAssignee: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveStatus: (taskId: string, statusName: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveBrief: (title: string, ctx: ToolContext) => Promise<NamedRef[]>
  propose: (ctx: ToolContext, toolName: string, payload: unknown) => Promise<string>
}

const defaultDeps: DeliveryDeps = {
  resolveTask: async (title) =>
    queryRows<NamedRef>(
      `SELECT id, title AS name FROM tasks
        WHERE title ILIKE $1 AND parent_task_id IS NULL
        ORDER BY (lower(title) = lower($2)) DESC, updated_at DESC LIMIT 6`,
      [ilike(title), title]),
  resolveAssignee: async (name) =>
    queryRows<NamedRef>(
      `SELECT id, name FROM team_members WHERE name ILIKE $1 AND is_active = true
        ORDER BY (lower(name) = lower($2)) DESC, name LIMIT 6`,
      [ilike(name), name]),
  // Statuses are board-scoped (task_statuses.department_id) plus global (NULL); match within the task's board.
  resolveStatus: async (taskId, statusName) =>
    queryRows<NamedRef>(
      `SELECT ts.id, ts.name FROM task_statuses ts
        WHERE (ts.department_id = (SELECT department_id FROM tasks WHERE id = $1) OR ts.department_id IS NULL)
          AND ts.name ILIKE $2
        ORDER BY (lower(ts.name) = lower($3)) DESC, ts.department_id NULLS LAST LIMIT 6`,
      [taskId, ilike(statusName), statusName]),
  // Only briefs that can actually be converted (briefConversion.ts requires approved/in_progress + not
  // already converted) — so we never stage a proposal the convert endpoint will 400/409 at confirm.
  resolveBrief: async (title) =>
    queryRows<NamedRef>(
      `SELECT id, title AS name FROM briefs
        WHERE title ILIKE $1 AND status IN ('approved','in_progress') AND converted_to_project_id IS NULL
        ORDER BY (lower(title) = lower($2)) DESC, created_at DESC LIMIT 6`,
      [ilike(title), title]),
  propose: (ctx, toolName, payload) => proposeAction(ctx, ctx.conversationId ?? null, toolName, payload),
}

/** Shared preflight: write-capable + inside a conversation (or an MCP call, which has no conversation). */
function preflight(ctx: ToolContext): ToolResult | null {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to make this change.')
  if (!isConversationlessProposeContext(ctx)) return fail('Cannot prepare this action outside a conversation.')
  return null
}

/** Resolve a fuzzy name to exactly one ref, or a disambiguation/none result. */
type Resolved<T> = { one: T } | { result: ToolResult }
function resolveOne<T extends NamedRef>(matches: T[], name: string, field: string, noneMsg: string): Resolved<T> {
  const picked = pickByExactName(matches, name)
  if (picked.length === 0) return { result: fail(noneMsg) }
  if (picked.length > 1) return { result: ok({ disambiguation: { field, options: picked } }) }
  return { one: picked[0]! }
}

// ---------- assign_task ----------
const assignParams = z.object({ taskTitle: z.string(), assigneeName: z.string() })
type AssignArgs = z.infer<typeof assignParams>

export async function proposeAssignTask(args: AssignArgs, ctx: ToolContext, deps: DeliveryDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx); if (pre) return pre
  const task = resolveOne(await deps.resolveTask(args.taskTitle, ctx), args.taskTitle, 'taskTitle', `No task matching "${args.taskTitle}".`)
  if ('result' in task) return task.result
  const assignee = resolveOne(await deps.resolveAssignee(args.assigneeName, ctx), args.assigneeName, 'assigneeName', `No team member matching "${args.assigneeName}".`)
  if ('result' in assignee) return assignee.result
  const resolved = { taskId: task.one.id, taskTitle: task.one.name, assigneeId: assignee.one.id, assigneeName: assignee.one.name }
  return ok({ proposalId: await deps.propose(ctx, 'assign_task', resolved), resolved })
}

export const assignTaskTool: AiTool<AssignArgs> = {
  name: 'assign_task',
  description: 'PROPOSE assigning (or reassigning) a task to a team member. Does NOT change anything — it prepares a '
    + 'proposal the user confirms with a button. Give the task title and the person\'s name; both resolve to one match. '
    + 'If the result has a `disambiguation`, ask the user to pick. Only say it\'s ready when there is a `proposalId`.',
  parameters: assignParams,
  mutates: true,
  handler: (a, c) => proposeAssignTask(a, c),
}

// ---------- propose_status_change ----------
const statusParams = z.object({ taskTitle: z.string(), status: z.string() })
type StatusArgs = z.infer<typeof statusParams>

export async function proposeStatusChange(args: StatusArgs, ctx: ToolContext, deps: DeliveryDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx); if (pre) return pre
  const task = resolveOne(await deps.resolveTask(args.taskTitle, ctx), args.taskTitle, 'taskTitle', `No task matching "${args.taskTitle}".`)
  if ('result' in task) return task.result
  const status = resolveOne(await deps.resolveStatus(task.one.id, args.status, ctx), args.status, 'status', `No status matching "${args.status}" on that task's board.`)
  if ('result' in status) return status.result
  const resolved = { taskId: task.one.id, taskTitle: task.one.name, statusId: status.one.id, statusName: status.one.name }
  return ok({ proposalId: await deps.propose(ctx, 'propose_status_change', resolved), resolved })
}

export const statusChangeTool: AiTool<StatusArgs> = {
  name: 'propose_status_change',
  description: 'PROPOSE moving a task to a different status (e.g. "In Progress", "Done"). Does NOT change anything — it '
    + 'prepares a proposal the user confirms. Give the task title and the target status name. If the result has a '
    + '`disambiguation`, ask the user to pick. Only say it\'s ready when there is a `proposalId`.',
  parameters: statusParams,
  mutates: true,
  handler: (a, c) => proposeStatusChange(a, c),
}

// ---------- propose_brief_convert ----------
const convertParams = z.object({ briefTitle: z.string(), projectName: z.string().optional() })
type ConvertArgs = z.infer<typeof convertParams>

export async function proposeBriefConvert(args: ConvertArgs, ctx: ToolContext, deps: DeliveryDeps = defaultDeps): Promise<ToolResult> {
  const pre = preflight(ctx); if (pre) return pre
  const brief = resolveOne(await deps.resolveBrief(args.briefTitle, ctx), args.briefTitle, 'briefTitle', `No brief matching "${args.briefTitle}".`)
  if ('result' in brief) return brief.result
  const resolved = { briefId: brief.one.id, briefTitle: brief.one.name, projectName: args.projectName?.trim() || null }
  return ok({ proposalId: await deps.propose(ctx, 'propose_brief_convert', resolved), resolved })
}

export const briefConvertTool: AiTool<ConvertArgs> = {
  name: 'propose_brief_convert',
  description: 'PROPOSE converting a brief into a project (creating the project and its starter tasks). Does NOT convert '
    + 'anything — it prepares a proposal the user confirms. Give the brief title; optionally a project name. If the result '
    + 'has a `disambiguation`, ask the user to pick. Only say it\'s ready when there is a `proposalId`.',
  parameters: convertParams,
  mutates: true,
  handler: (a, c) => proposeBriefConvert(a, c),
}
