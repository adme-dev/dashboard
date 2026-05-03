/**
 * GET /api/customers/[contactId]/collections
 *
 * Activity log for a single customer's collections actions (reminders,
 * calls, notes, escalations, paid markers).
 */

import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface LogRow {
  id: string
  action: string
  invoice_id: string | null
  notes: string | null
  created_at: string
  created_by: string | null
  user_name: string | null
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const query = getQuery(event)
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))

  const rows = await queryRows<LogRow>(
    `SELECT l.id, l.action, l.invoice_id, l.notes, l.created_at, l.created_by,
            tm.name AS user_name
       FROM customer_collections_log l
       LEFT JOIN team_members tm ON tm.id = l.created_by
       WHERE l.tenant_id = $1 AND l.contact_id = $2
       ORDER BY l.created_at DESC
       LIMIT $3`,
    [tenantId, contactId, limit],
  )

  return {
    log: rows.map(r => ({
      id: r.id,
      action: r.action,
      invoiceId: r.invoice_id,
      notes: r.notes,
      createdAt: r.created_at,
      createdBy: r.created_by ? { id: r.created_by, name: r.user_name } : null,
    })),
  }
})
