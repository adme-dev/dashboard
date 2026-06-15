import { defineEventHandler } from 'h3'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { getSelectedTenant } from '~~/server/utils/session'
import { getSpendAutoActionPolicy } from '~~/server/utils/spendAutoActionConfig'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin'])
  const tenantId = await getSelectedTenant(event)
  return getSpendAutoActionPolicy(tenantId || '')
})
