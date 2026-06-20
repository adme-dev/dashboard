import { z } from 'zod'
import { ok, fail, capWithMore, portalDb, type PortalAiTool, type PortalToolContext, type ToolResult } from './portalContext'

const params = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'all']).default('pending'),
})
type Args = z.infer<typeof params>

/**
 * Read the customer's approvals. Tenant boundary: `client_approvals` scopes via its project
 * (`projects.client_id = $1`); clientScope is ALWAYS `$1`. Mirrors /api/portal/approvals.
 */
export async function getMyApprovals(args: Args, ctx: PortalToolContext): Promise<ToolResult> {
  try {
    const where = ['p.client_id = $1']
    const p: any[] = [ctx.clientScope]
    if (args.status !== 'all') {
      where.push(`ca.status = $${p.length + 1}`)
      p.push(args.status)
    }
    const rows = await portalDb(ctx).queryRows(
      `SELECT ca.id, ca.approval_type, ca.title, ca.status, ca.due_date, ca.requested_at,
              p.name AS project_name
       FROM client_approvals ca
       JOIN projects p ON ca.project_id = p.id
       WHERE ${where.join(' AND ')}
       ORDER BY ca.requested_at DESC NULLS LAST
       LIMIT 50`,
      p,
    )
    const { items, more } = capWithMore(rows, 25)
    return ok({ approvals: items, more })
  } catch {
    return fail('Could not load your approvals right now.')
  }
}

export const getMyApprovalsTool: PortalAiTool<Args> = {
  name: 'get_my_approvals',
  description: 'List the items awaiting the customer\'s review/approval (proofs, deliverables) for their projects. '
    + 'Use for "what needs my approval", "what am I waiting to sign off". Defaults to pending; can show all/approved/rejected. '
    + 'Returns an approval list (title, type, status, due date, project) capped at 25 with a `more` count. Read-only.',
  parameters: params,
  returnsUntrusted: true,
  handler: getMyApprovals,
}
