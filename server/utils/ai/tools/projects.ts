import { z } from 'zod'
import { queryRows, queryOne } from '~~/server/utils/db'
import type { AiTool } from '../toolRegistry'
import { ok, fail, type ToolContext, type ToolResult } from '../toolContext'

const params = z.object({
  projectName: z.string().optional(),
  clientName: z.string().optional(),
})
type Args = z.infer<typeof params>

/** Compact row used for both resolution and the single-match projection. */
type ProjectRow = { id: string, name: string, status: string, client: string, budget: number }

export type ProjectsDeps = {
  /** Fuzzy lookup over projects + agency_clients. Caps at 20 rows. */
  findProjects: (args: Args, ctx: ToolContext) => Promise<ProjectRow[]>
  /** Task rollup for a single resolved project. */
  taskRollup: (projectId: string, ctx: ToolContext) => Promise<{ total: number }>
}

// ILIKE wildcard escaping — canonical pattern used across the codebase (crm/filters.ts, leads).
const escapeLike = (v: string) => '%' + v.replace(/[%_]/g, c => '\\' + c) + '%'

const defaultDeps: ProjectsDeps = {
  findProjects: async (args) => {
    // Columns confirmed against server/api/agency/projects/index.get.ts:
    // projects(id, name, status, client_id, budget_amount) JOIN agency_clients c.
    const where: string[] = []
    const sqlParams: any[] = []
    let i = 1
    if (args.projectName) {
      where.push(`p.name ILIKE $${i++}`)
      sqlParams.push(escapeLike(args.projectName))
    }
    if (args.clientName) {
      where.push(`c.name ILIKE $${i++}`)
      sqlParams.push(escapeLike(args.clientName))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const rows = await queryRows(
      `SELECT p.id, p.name, p.status, COALESCE(c.name, '—') AS client, COALESCE(p.budget_amount, 0) AS budget
       FROM projects p
       LEFT JOIN agency_clients c ON p.client_id = c.id
       ${whereSql}
       ORDER BY p.start_date DESC NULLS LAST
       LIMIT 20`,
      sqlParams,
    )
    return rows.map(r => ({
      id: String(r.id),
      name: String(r.name),
      status: String(r.status ?? 'unknown'),
      client: String(r.client ?? '—'),
      budget: Number(r.budget ?? 0),
    }))
  },
  taskRollup: async (projectId) => {
    const r = await queryOne(
      `SELECT COUNT(*)::int AS total FROM tasks WHERE project_id = $1`,
      [projectId],
    )
    return { total: Number(r?.total ?? 0) }
  },
}

export async function getProjectStatus(args: Args, ctx: ToolContext, deps: ProjectsDeps = defaultDeps): Promise<ToolResult> {
  try {
    const matches = await deps.findProjects(args, ctx)

    if (matches.length === 0) {
      return fail('No matching project found. Try a different project or client name.')
    }

    // Ambiguous: let the model pick rather than guessing.
    if (matches.length > 1) {
      return ok({
        disambiguation: matches.slice(0, 20).map(m => ({ id: m.id, name: m.name, client: m.client })),
      })
    }

    const p = matches[0]
    const rollup = await deps.taskRollup(p.id, ctx)
    return ok({
      name: p.name,
      status: p.status,
      client: p.client,
      taskCount: rollup.total,
      budget: p.budget,
    })
  } catch {
    return fail('Could not load project status — the project data may be unavailable.')
  }
}

export const projectsTool: AiTool<Args> = {
  name: 'get_project_status',
  description: 'Look up a project by name (and/or client name) and return its status, owning client, open task count, and budget. Use for "what\'s the status of <project> / how is <client>\'s project going / what\'s the budget on X". If the name matches more than one project it returns a short disambiguation list to choose from — call again with a more specific name. Do NOT use for finance/cashflow (use get_finance_snapshot) or ad spend.',
  parameters: params,
  handler: (a, c) => getProjectStatus(a, c),
}
