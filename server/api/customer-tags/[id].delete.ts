/**
 * DELETE /api/customer-tags/[id]
 *
 * Removes a tag from the dictionary and cascades to all assignments.
 * ADMIN-only — tags are an org-wide construct and shouldn't be removed
 * by non-admins.
 */

import { defineEventHandler, getRouterParam, createError } from 'h3'
import { execute } from '~~/server/utils/db'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...PERMISSIONS.ADMIN])

  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'tag id required' })
  }

  // Tenant-scoped delete prevents one tenant deleting another's tags via
  // crafted UUIDs. The FK on customer_tag_assignments cascades so the
  // assignments disappear with the dictionary entry.
  const rowsAffected = await execute(
    `DELETE FROM customer_tags WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  if (rowsAffected === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Tag not found' })
  }

  return { success: true }
})
