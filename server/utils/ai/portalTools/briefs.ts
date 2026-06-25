import { z } from 'zod'
import { ok, fail, capWithMore, type ToolResult } from '../toolContext'
import { portalDb, type PortalAiTool, type PortalToolContext } from './portalContext'

const params = z.object({
  status: z.string().trim().max(40).optional(),
})
type Args = z.infer<typeof params>

/** Read the customer's briefs/requests. `briefs.client_id = $1` is the tenant boundary. Mirrors /api/portal/briefs. */
export async function getMyBriefs(args: Args, ctx: PortalToolContext): Promise<ToolResult> {
  try {
    const where = ['b.client_id = $1']
    const p: any[] = [ctx.clientScope]
    if (args.status) {
      where.push(`b.status = $${p.length + 1}`)
      p.push(args.status)
    }
    const rows = await portalDb(ctx).queryRows(
      `SELECT b.id, b.reference_number, b.title, b.status, b.priority,
              b.requested_deadline, b.created_at,
              bt.name AS template_name
       FROM briefs b
       LEFT JOIN brief_templates bt ON b.template_id = bt.id
       WHERE ${where.join(' AND ')}
       ORDER BY CASE WHEN b.status = 'submitted' THEN 0 ELSE 1 END, b.created_at DESC
       LIMIT 50`,
      p,
    )
    const { items, more } = capWithMore(rows, 25)
    return ok({ briefs: items, more })
  } catch {
    return fail('Could not load your briefs right now.')
  }
}

export const getMyBriefsTool: PortalAiTool<Args> = {
  name: 'get_my_briefs',
  description: 'List the customer\'s briefs/requests — reference, title, status, priority, requested deadline and template. '
    + 'Use for "my briefs", "what requests have I submitted", "status of my brief". Optionally filter by status. '
    + 'Returns a brief list capped at 25 with a `more` count. Read-only.',
  parameters: params,
  returnsUntrusted: true,
  handler: getMyBriefs,
}
