import { z } from 'zod'
import { ok, fail, capWithMore, type ToolResult } from '../toolContext'
import { portalDb, type PortalAiTool, type PortalToolContext } from './portalContext'

const params = z.object({
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'all']).default('all'),
})
type Args = z.infer<typeof params>

/** Read the customer's invoices. `invoices.client_id = $1` is the tenant boundary. Mirrors /api/portal/invoices. */
export async function getMyInvoices(args: Args, ctx: PortalToolContext): Promise<ToolResult> {
  try {
    const where = ['i.client_id = $1']
    const p: any[] = [ctx.clientScope]
    if (args.status !== 'all') {
      where.push(`i.status = $${p.length + 1}`)
      p.push(args.status)
    }
    const rows = await portalDb(ctx).queryRows(
      `SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
              i.total_amount, i.amount_paid,
              pr.name AS project_name
       FROM invoices i
       LEFT JOIN projects pr ON i.project_id = pr.id
       WHERE ${where.join(' AND ')}
       ORDER BY i.due_date ASC NULLS LAST
       LIMIT 50`,
      p,
    )
    const { items, more } = capWithMore(rows, 25)
    return ok({ invoices: items, more })
  } catch {
    return fail('Could not load your invoices right now.')
  }
}

export const getMyInvoicesTool: PortalAiTool<Args> = {
  name: 'get_my_invoices',
  description: 'List the customer\'s invoices — number, status, issue/due date, total and amount paid, and the related project. '
    + 'Use for "my invoices", "what do I owe", "which invoices are overdue". Optionally filter by status. '
    + 'Returns an invoice list capped at 25 with a `more` count. Read-only.',
  parameters: params,
  requiredPermission: 'canViewInvoices',
  handler: getMyInvoices,
}
