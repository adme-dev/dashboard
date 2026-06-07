import { z } from 'zod'
import { queryRows } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, escapeLike, capWithMore, type ToolContext, type ToolResult } from '../toolContext'
import { PERMISSIONS } from '~~/server/utils/permissions'

const params = z.object({
  scope: z.enum(['mine', 'all']).default('mine'),
  status: z.string().optional(),
  overdue: z.boolean().optional(),
  projectOrClientName: z.string().optional(),
})
type Args = z.infer<typeof params>

const CAP = 20

/** Roles allowed to read tasks beyond their own — single-sourced from PERMISSIONS.MANAGEMENT. */
const MANAGER_ROLES = new Set<string>(PERMISSIONS.MANAGEMENT)

/** Compact, model-facing projection of a task. */
export type AiTaskRow = {
  id: string
  title: string
  status: string | null
  assignee: string | null
  due: string | null
  project: string | null
}

/**
 * The post-authorization filter the handler hands to the data layer. `scope`/`assigneeId`
 * are derived from the CALLER's role+id here (never from model-supplied args) so row scoping
 * is enforced — and testable — inside the pure handler.
 */
export type TaskFilter = {
  scope: 'mine' | 'all'
  /** Present (and enforced) for own-only reads; absent for manager scope:'all'. */
  assigneeId?: string
  status?: string
  overdue?: boolean
  projectOrClientName?: string
}

export type TasksDeps = {
  fetchTasks: (filter: TaskFilter) => Promise<AiTaskRow[]>
}

// Real wiring: tasks live in Postgres. Column names copied from server/api/agency/tasks/*
// (status via task_statuses join; status_is_final denormalized onto tasks; project via projects).
const defaultDeps: TasksDeps = {
  fetchTasks: async (filter) => {
    const conditions: string[] = []
    const values: any[] = []
    let idx = 1

    // Own-only enforcement: pinned by the handler for non-managers / scope:'mine'.
    if (filter.assigneeId) {
      conditions.push(`t.assignee_id = $${idx}`)
      values.push(filter.assigneeId)
      idx++
    }

    if (filter.status) {
      const escaped = escapeLike(filter.status)
      conditions.push(`ts.name ILIKE $${idx}`)
      values.push(`%${escaped}%`)
      idx++
    }

    if (filter.overdue) {
      conditions.push('t.due_date < CURRENT_DATE AND t.status_is_final = false')
    }

    if (filter.projectOrClientName) {
      const escaped = escapeLike(filter.projectOrClientName)
      conditions.push(`p.name ILIKE $${idx}`)
      values.push(`%${escaped}%`)
      idx++
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    // Fetch CAP+1 so the handler can report whether more rows exist.
    values.push(CAP + 1)

    const rows = await queryRows<any>(
      `SELECT
         t.id,
         t.title,
         ts.name AS status_name,
         assignee.name AS assignee_name,
         t.due_date,
         p.name AS project_name
       FROM tasks t
       LEFT JOIN task_statuses ts ON t.status_id = ts.id
       LEFT JOIN projects p ON t.project_id = p.id
       LEFT JOIN team_members assignee ON t.assignee_id = assignee.id
       ${whereClause}
       ORDER BY t.due_date ASC NULLS LAST, t.created_at DESC
       LIMIT $${idx}`,
      values,
    )

    return rows.map(r => ({
      id: r.id,
      title: r.title,
      status: r.status_name ?? null,
      assignee: r.assignee_name ?? null,
      due: r.due_date ?? null,
      project: r.project_name ?? null,
    }))
  },
}

export async function getTasks(args: Args, ctx: ToolContext, deps: TasksDeps = defaultDeps): Promise<ToolResult> {
  try {
    const isManager = MANAGER_ROLES.has(ctx.userRole)
    // SECURITY: non-managers can never widen to 'all'; collapse to own-only.
    // Managers with scope:'mine' are also pinned to their own id by request.
    const effectiveScope: 'mine' | 'all' = isManager && args.scope === 'all' ? 'all' : 'mine'

    const filter: TaskFilter = {
      scope: effectiveScope,
      // assigneeId is the authorization pin — derived from the caller, never the model.
      ...(effectiveScope === 'mine' ? { assigneeId: ctx.userId } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.overdue ? { overdue: args.overdue } : {}),
      ...(args.projectOrClientName ? { projectOrClientName: args.projectOrClientName } : {}),
    }

    const rows = await deps.fetchTasks(filter)
    const { items, more } = capWithMore(rows, CAP)
    return ok({
      tasks: items.map(r => ({
        title: r.title,
        status: r.status,
        assignee: r.assignee,
        due: r.due,
        project: r.project,
      })),
      more,
    })
  } catch {
    return fail('Could not load tasks — the task store may be unavailable.')
  }
}

export const tasksTool: AiTool<Args> = {
  name: 'get_tasks',
  description: 'List work-management tasks for the current user (or, for managers, across the agency). Use for "what am I working on / what\'s overdue / show tasks for the Acme project". Non-managers always see only their own assigned tasks. Supports filtering by status name, overdue, and project/client name. Returns a compact list (title, status, assignee, due date, project) capped at 20 with a more count. Do NOT use for ad-spend or finance.',
  parameters: params,
  handler: (a, c) => getTasks(a, c),
}
