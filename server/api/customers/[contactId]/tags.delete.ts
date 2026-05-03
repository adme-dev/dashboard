/**
 * DELETE /api/customers/[contactId]/tags?tagId=<uuid>
 *
 * Removes a single tag assignment from a customer. The tag itself
 * remains in the dictionary.
 */

import { defineEventHandler, getRouterParam, getQuery, createError } from 'h3'
import { execute } from '~~/server/utils/db'
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
  const query = getQuery(event)
  const tagId = String(query.tagId ?? '')
  if (!tagId) {
    throw createError({ statusCode: 400, statusMessage: 'tagId query param required' })
  }

  await execute(
    `DELETE FROM customer_tag_assignments
       WHERE tenant_id = $1 AND contact_id = $2 AND tag_id = $3`,
    [tenantId, contactId, tagId],
  )

  return { success: true }
})
