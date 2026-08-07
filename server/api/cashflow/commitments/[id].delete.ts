/**
 * DELETE /api/cashflow/commitments/:id
 *
 * Hard-deletes a commitment. Use status 'closed' instead to retain history —
 * delete is for entry mistakes.
 */

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organization selected' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const deleted = await queryOne(
    `DELETE FROM cashflow_commitments WHERE tenant_id = $1 AND id = $2 RETURNING id`,
    [tenantId, id],
  )
  if (!deleted) throw createError({ statusCode: 404, statusMessage: 'Commitment not found' })
  return { deleted: true }
})
