/**
 * GET /api/customers/[contactId]/tags
 *
 * Returns the tags assigned to a single customer.
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

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

  const rows = await queryRows<{ id: string; label: string; color: string; assigned_at: string }>(
    `SELECT t.id, t.label, t.color, a.assigned_at
       FROM customer_tag_assignments a
       JOIN customer_tags t
         ON t.id = a.tag_id AND t.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.contact_id = $2
       ORDER BY t.label ASC`,
    [tenantId, contactId],
  )

  return { tags: rows }
})
