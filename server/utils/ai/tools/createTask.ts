import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import { isReadOnlyRole } from '~~/server/utils/permissions'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, type ToolContext, type ToolResult } from '../toolContext'
import { proposeAction } from '../pendingActions'

const params = z.object({
  title: z.string(),
  boardName: z.string().optional(),       // → department (tasks require a department/board)
  projectName: z.string().optional(),
  assigneeName: z.string().optional(),
  dueDate: z.string().optional(),         // ISO date; surfaced for user confirmation
  description: z.string().optional(),
})
type Args = z.infer<typeof params>

export type NamedRef = { id: string, name: string }

export type CreateTaskDeps = {
  resolveDepartment: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveProject: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveAssignee: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  /** Persist the proposal; returns the proposal id. */
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

function ilike(name: string): string {
  return `%${escapeLike(name)}%`
}

const defaultDeps: CreateTaskDeps = {
  resolveDepartment: async name =>
    queryRows<NamedRef>('SELECT id, name FROM departments WHERE name ILIKE $1 AND is_active = true ORDER BY name LIMIT 6', [ilike(name)]),
  resolveProject: async name =>
    queryRows<NamedRef>('SELECT id, name FROM projects WHERE name ILIKE $1 ORDER BY name LIMIT 6', [ilike(name)]),
  resolveAssignee: async name =>
    queryRows<NamedRef>('SELECT id, name FROM team_members WHERE name ILIKE $1 AND is_active = true ORDER BY name LIMIT 6', [ilike(name)]),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId!, 'create_task', payload),
}

/**
 * Option B: PROPOSE a task only — resolve names→ids, check write access, persist a pending row,
 * and return the proposal for the confirmation card. This NEVER creates a task; the confirm
 * endpoint does, on a human click.
 */
export async function proposeCreateTask(args: Args, ctx: ToolContext, deps: CreateTaskDeps = defaultDeps): Promise<ToolResult> {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to create tasks.')
  if (!ctx.conversationId) return fail('Cannot prepare a task outside a conversation.')
  if (!args.title?.trim()) return fail('A task needs a title.')

  // Department/board is REQUIRED to create a task — resolve it or ask.
  if (!args.boardName) return fail('Which board or department should this task go on?')
  const depts = await deps.resolveDepartment(args.boardName, ctx)
  if (depts.length === 0) return fail(`No board or department matching "${args.boardName}".`)
  if (depts.length > 1) return ok({ disambiguation: { field: 'boardName', options: depts } })
  const department = depts[0]!

  // Optional project — disambiguate if multiple match; ignore if none.
  let project: NamedRef | null = null
  if (args.projectName) {
    const ps = await deps.resolveProject(args.projectName, ctx)
    if (ps.length > 1) return ok({ disambiguation: { field: 'projectName', options: ps } })
    project = ps[0] ?? null
  }

  // Optional assignee — disambiguate if multiple match; ignore if none.
  let assignee: NamedRef | null = null
  if (args.assigneeName) {
    const as = await deps.resolveAssignee(args.assigneeName, ctx)
    if (as.length > 1) return ok({ disambiguation: { field: 'assigneeName', options: as } })
    assignee = as[0] ?? null
  }

  const resolved = {
    title: args.title.trim(),
    departmentId: department.id,
    departmentName: department.name,
    projectId: project?.id ?? null,
    projectName: project?.name ?? null,
    assigneeId: assignee?.id ?? null,
    assigneeName: assignee?.name ?? null,
    dueDate: args.dueDate ?? null,
    description: args.description?.trim() ?? null,
  }
  const proposalId = await deps.propose(ctx, resolved)
  return ok({ proposalId, resolved })
}

/** Map a stored create_task proposal to the body the /api/agency/tasks endpoint expects. */
export function proposalToTaskBody(payload: any, reporterId: string) {
  return {
    departmentId: payload?.departmentId,
    title: payload?.title,
    projectId: payload?.projectId ?? undefined,
    assigneeId: payload?.assigneeId ?? undefined,
    dueDate: payload?.dueDate ?? undefined,
    description: payload?.description ?? undefined,
    reporterId,
  }
}

export const createTaskTool: AiTool<Args> = {
  name: 'create_task',
  description: 'PROPOSE creating a new work-management task. This does NOT create the task — it prepares a proposal that the user must explicitly confirm with a button click. Requires a board/department name (ask the user if unknown). Optionally takes a project, assignee, due date (ISO), and description. Use when the user asks to add/create a task or follow-up. Always tell the user the task is pending their confirmation; never claim it was created.',
  parameters: params,
  mutates: true,
  handler: (a, c) => proposeCreateTask(a, c),
}
