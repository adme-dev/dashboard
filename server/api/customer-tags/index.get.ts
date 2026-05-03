/**
 * GET /api/customer-tags
 *
 * Returns the tag dictionary for the connected tenant + a count of how many
 * customers each tag is assigned to. Used by the list-page filter chips and
 * the tag picker in the detail page.
 */

import { defineEventHandler, createError } from 'h3'
import { queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

interface TagRow {
  id: string
  label: string
  color: string
  customer_count: string | number
  created_at: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }

  const rows = await queryRows<TagRow>(
    `SELECT t.id, t.label, t.color, t.created_at,
            COUNT(a.contact_id)::text AS customer_count
       FROM customer_tags t
       LEFT JOIN customer_tag_assignments a
         ON a.tag_id = t.id AND a.tenant_id = t.tenant_id
       WHERE t.tenant_id = $1
       GROUP BY t.id
       ORDER BY t.label ASC`,
    [tenantId],
  )

  return {
    tags: rows.map(r => ({
      id: r.id,
      label: r.label,
      color: r.color,
      customerCount: Number(r.customer_count) || 0,
      createdAt: r.created_at,
    })),
  }
})
