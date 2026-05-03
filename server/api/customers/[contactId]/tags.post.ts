/**
 * POST /api/customers/[contactId]/tags
 *
 * Assign one or more tags to a customer. Body: { tagIds: string[] }.
 * Idempotent — re-assigning an existing tag is a no-op (ON CONFLICT DO NOTHING).
 */

import { defineEventHandler, getRouterParam, readBody, createError } from 'h3'
import { execute, queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const contactId = getRouterParam(event, 'contactId')
  if (!contactId) {
    throw createError({ statusCode: 400, statusMessage: 'contactId required' })
  }

  const body = await readBody<{ tagIds?: string[] }>(event) ?? {}
  const tagIds = Array.isArray(body.tagIds) ? body.tagIds.filter(Boolean) : []
  if (!tagIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'tagIds[] required' })
  }
  if (tagIds.length > 50) {
    throw createError({ statusCode: 400, statusMessage: 'Too many tags in one request (max 50)' })
  }

  // Confirm contact exists in cache
  const contactExists = await queryOne<{ contact_id: string }>(
    `SELECT contact_id FROM xero_contacts_cache WHERE tenant_id = $1 AND contact_id = $2`,
    [tenantId, contactId],
  )
  if (!contactExists) {
    throw createError({ statusCode: 404, statusMessage: 'Customer not in cache' })
  }

  // Bulk insert via UNNEST — one round-trip regardless of tag count.
  await execute(
    `INSERT INTO customer_tag_assignments (tenant_id, contact_id, tag_id, assigned_by)
     SELECT $1, $2, t.id, $4
       FROM customer_tags t
       WHERE t.id = ANY($3::uuid[]) AND t.tenant_id = $1
     ON CONFLICT (tenant_id, contact_id, tag_id) DO NOTHING`,
    [tenantId, contactId, tagIds, user.id],
  )

  return { success: true, assigned: tagIds.length }
})
