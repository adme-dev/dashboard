import { z } from 'zod'
import { ok, fail, capWithMore, portalDb, type PortalAiTool, type PortalToolContext, type ToolResult } from './portalContext'

const params = z.object({
  status: z.enum(['active', 'on_hold', 'completed', 'all']).default('all'),
})
type Args = z.infer<typeof params>

/** Read the customer's projects + progress. `projects.client_id = $1` is the tenant boundary. Mirrors /api/portal/projects. */
export async function getMyProjects(args: Args, ctx: PortalToolContext): Promise<ToolResult> {
  try {
    const where = ['p.client_id = $1']
    const p: any[] = [ctx.clientScope]
    if (args.status !== 'all') {
      where.push(`p.status = $${p.length + 1}`)
      p.push(args.status)
    }
    const rows = await portalDb(ctx).queryRows(
      `SELECT p.id, p.name, p.status, p.start_date, p.due_date,
              COALESCE(t.total, 0)     AS total_tasks,
              COALESCE(t.completed, 0) AS completed_tasks,
              pm.name AS project_manager_name
       FROM projects p
       LEFT JOIN team_members pm ON p.project_manager_id = pm.id
       LEFT JOIN (
         SELECT project_id,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
         FROM tasks GROUP BY project_id
       ) t ON t.project_id = p.id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN p.status = 'active' THEN 0 ELSE 1 END, p.due_date ASC NULLS LAST
       LIMIT 50`,
      p,
    )
    const { items, more } = capWithMore(rows, 25)
    return ok({ projects: items, more })
  } catch {
    return fail('Could not load your projects right now.')
  }
}

export const getMyProjectsTool: PortalAiTool<Args> = {
  name: 'get_project_status_portal',
  description: 'Status of the customer\'s projects — name, status, start/due dates, task progress (completed/total) and project manager. '
    + 'Use for "how is my project going", "what\'s the status of <project>", "what\'s due soon". Optionally filter by status. '
    + 'Returns a project list capped at 25 with a `more` count. Read-only.',
  parameters: params,
  handler: getMyProjects,
}
