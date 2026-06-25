import { z } from 'zod'
import { ok, fail, capWithMore, type ToolResult } from '../toolContext'
import { portalDb, type PortalAiTool, type PortalToolContext } from './portalContext'

const params = z.object({
  status: z.enum(['new', 'contacted', 'all']).default('all'),
})
type Args = z.infer<typeof params>

/**
 * Read the customer's portal-visible leads. `leads.client_id = $1` is the tenant boundary; the EXISTS
 * clause mirrors the portal inbox's visibility rule (only leads whose form rule routes to the portal)
 * so the agent surfaces exactly what /api/client-portal/leads shows — never the full lead firehose.
 */
export async function getMyLeads(args: Args, ctx: PortalToolContext): Promise<ToolResult> {
  try {
    const where = [
      'l.client_id = $1',
      'l.deleted_at IS NULL',
      `EXISTS (
         SELECT 1 FROM lead_form_rules r
         JOIN lead_rule_destinations d ON d.rule_id = r.id
         WHERE r.source = l.source AND r.form_id = l.form_id
           AND r.client_id = l.client_id
           AND r.enabled = TRUE
           AND d.destination_type = 'portal' AND d.enabled = TRUE
       )`,
    ]
    const p: any[] = [ctx.clientScope]
    if (args.status === 'new') where.push('l.contacted_at IS NULL')
    else if (args.status === 'contacted') where.push('l.contacted_at IS NOT NULL')
    const rows = await portalDb(ctx).queryRows(
      `SELECT l.id, l.source, l.form_name, l.campaign_name, l.status,
              l.submitted_at, l.contacted_at
       FROM leads l
       WHERE ${where.join(' AND ')}
       ORDER BY l.submitted_at DESC
       LIMIT 50`,
      p,
    )
    const { items, more } = capWithMore(rows, 25)
    return ok({ leads: items, more })
  } catch {
    return fail('Could not load your leads right now.')
  }
}

export const getMyLeadsTool: PortalAiTool<Args> = {
  name: 'get_my_leads',
  description: 'List the customer\'s portal-visible leads — source, form, campaign, status, submitted/contacted dates. '
    + 'Use for "my new leads", "what leads came in", "which leads haven\'t been contacted". Filter new/contacted/all. '
    + 'Returns a lead list capped at 25 with a `more` count. Read-only.',
  parameters: params,
  returnsUntrusted: true,
  handler: getMyLeads,
}
