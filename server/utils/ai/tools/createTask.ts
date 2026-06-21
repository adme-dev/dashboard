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
  /** Boards belonging to a workspace EXACTLY named `name` (the sidebar groupings: Main/ADME/…); [] if no such workspace. */
  resolveWorkspaceBoards: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveProject: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  resolveAssignee: (name: string, ctx: ToolContext) => Promise<NamedRef[]>
  /** Persist the proposal; returns the proposal id. */
  propose: (ctx: ToolContext, payload: unknown) => Promise<string>
}

function ilike(name: string): string {
  return `%${escapeLike(name)}%`
}

/**
 * Collapse fuzzy name matches to a single ref when the query EXACTLY names one (case-insensitive),
 * even if it's also a substring of others. Boards live in `departments` as fully-qualified names
 * (e.g. "ADME Creative Request" among many "ADME …"), so a substring match alone almost always
 * returns many and dead-ends in disambiguation — never producing a real proposal (so the confirm
 * card never renders). An exact match is unambiguous user intent; honor it. Returns the original
 * list otherwise (no exact, or >1 exact) so the caller's count-based logic still applies.
 */
export function pickByExactName<T extends { name: string }>(candidates: T[], name: string): T[] {
  const target = name.trim().toLowerCase()
  const exact = candidates.filter(c => c.name.trim().toLowerCase() === target)
  return exact.length === 1 ? exact : candidates
}

const defaultDeps: CreateTaskDeps = {
  // Exact-name matches sort first so a fully-specified name is always within the LIMIT (and thus
  // selectable by pickByExactName) even when many substring matches exist.
  resolveDepartment: async name =>
    queryRows<NamedRef>('SELECT id, name FROM departments WHERE name ILIKE $1 AND is_active = true ORDER BY (lower(name) = lower($2)) DESC, name LIMIT 6', [ilike(name), name]),
  // Workspace fallback: the boards inside a workspace EXACTLY named `name` (e.g. "Main", "ADME"),
  // so a casual workspace name leads to a board pick instead of dead-ending. Exact (not substring)
  // workspace match avoids "Mar" pulling the whole Marketing workspace.
  resolveWorkspaceBoards: async name =>
    queryRows<NamedRef>(
      `SELECT d.id, d.name FROM departments d
         JOIN workspaces w ON w.id = d.workspace_id
        WHERE lower(w.name) = lower($1) AND d.is_active = true
          AND d.name NOT ILIKE 'Subitems of %'   -- hide auto-generated subitem boards
        ORDER BY d.sort_order NULLS LAST, d.name
        LIMIT 12`,
      [name],
    ),
  resolveProject: async name =>
    queryRows<NamedRef>('SELECT id, name FROM projects WHERE name ILIKE $1 ORDER BY (lower(name) = lower($2)) DESC, name LIMIT 6', [ilike(name), name]),
  resolveAssignee: async name =>
    queryRows<NamedRef>('SELECT id, name FROM team_members WHERE name ILIKE $1 AND is_active = true ORDER BY (lower(name) = lower($2)) DESC, name LIMIT 6', [ilike(name), name]),
  propose: (ctx, payload) => proposeAction(ctx, ctx.conversationId ?? null, 'create_task', payload),
}

/**
 * Option B: PROPOSE a task only — resolve names→ids, check write access, persist a pending row,
 * and return the proposal for the confirmation card. This NEVER creates a task; the confirm
 * endpoint does, on a human click.
 */
export async function proposeCreateTask(args: Args, ctx: ToolContext, deps: CreateTaskDeps = defaultDeps): Promise<ToolResult> {
  if (isReadOnlyRole(ctx.userRole)) return fail('You do not have permission to create tasks.')
  if (!ctx.conversationId && ctx.source !== 'mcp') return fail('Cannot prepare a task outside a conversation.')
  if (!args.title?.trim()) return fail('A task needs a title.')

  // Department/board is REQUIRED to create a task — resolve it or ask. An exact board name wins over
  // broader substring matches (pickByExactName). When the name isn't a unique board, fall back to
  // treating it as a WORKSPACE and listing that workspace's boards (so casual names like "Main"/
  // "ADME"/"Marketing" lead to a board pick instead of dead-ending or matching random boards).
  if (!args.boardName) return fail('Which board or department should this task go on?')
  const depts = pickByExactName(await deps.resolveDepartment(args.boardName, ctx), args.boardName)
  if (depts.length !== 1) {
    const wsBoards = await deps.resolveWorkspaceBoards(args.boardName, ctx)
    if (wsBoards.length > 0) {
      return ok({ disambiguation: { field: 'boardName', options: wsBoards, note: `"${args.boardName}" is a workspace — choose one of its boards.` } })
    }
    if (depts.length === 0) return fail(`No board or workspace matching "${args.boardName}".`)
    return ok({ disambiguation: { field: 'boardName', options: depts } })
  }
  const department = depts[0]!

  // Optional project — disambiguate if multiple match; ignore if none.
  let project: NamedRef | null = null
  if (args.projectName) {
    const ps = pickByExactName(await deps.resolveProject(args.projectName, ctx), args.projectName)
    if (ps.length > 1) return ok({ disambiguation: { field: 'projectName', options: ps } })
    project = ps[0] ?? null
  }

  // Optional assignee — disambiguate if multiple match; ignore if none.
  let assignee: NamedRef | null = null
  if (args.assigneeName) {
    const as = pickByExactName(await deps.resolveAssignee(args.assigneeName, ctx), args.assigneeName)
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
  description: 'PROPOSE creating a new work-management task. This does NOT create the task — it prepares a proposal that the user must explicitly confirm with a button click. Requires a board/department name (ask the user if unknown). Optionally takes a project, assignee, due date (ISO), and description. Use when the user asks to add/create a task or follow-up. If the result contains a `disambiguation` (several matching boards/projects/people), the proposal was NOT prepared — list the exact options and ask the user to pick one; only call again with an exact name. Only state that a proposal is ready for confirmation when the result contains a `proposalId`. Never claim the task was created.',
  parameters: params,
  mutates: true,
  handler: (a, c) => proposeCreateTask(a, c),
}
