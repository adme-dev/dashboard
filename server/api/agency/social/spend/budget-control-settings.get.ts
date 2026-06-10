import { createError, defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSocialBudgetControlConfig } from '~~/server/utils/socialBudgetControlConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) throw createError({ statusCode: 400, statusMessage: 'No organization selected' })

  return await getSocialBudgetControlConfig(tenantId)
})
