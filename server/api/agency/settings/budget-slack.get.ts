import { defineEventHandler, createError } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getBudgetSlackConfig } from '~~/server/utils/budgetSlackConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })
  return await getBudgetSlackConfig(tenantId)
})
