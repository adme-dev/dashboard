import { defineEventHandler } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import {
  getSocialBudgetControlConfig,
  DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG,
} from '~~/server/utils/socialBudgetControlConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const tenantId = await getSelectedTenant(event)
  // No Xero org connected → no tenant to scope config to. Degrade to the safe
  // "recommend only" defaults instead of 400ing, so the spend page loads clean
  // even before Xero is connected. Saving (PUT) still requires a tenant.
  if (!tenantId) return DEFAULT_SOCIAL_BUDGET_CONTROL_CONFIG

  return await getSocialBudgetControlConfig(tenantId)
})
