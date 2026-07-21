import { requirePermission } from '~~/server/utils/auth'
import { setSelectedTenant } from '~~/server/utils/session'
import { getActiveOrgToken } from '~~/server/utils/tokenStore'
import { fetchXeroTenants } from '~~/server/utils/xeroClient'

export default eventHandler(async (event) => {
  await requirePermission(event, 'FINANCE')
  const body = await readBody<{ tenantId?: string, tenantName?: string }>(event)
  const tenantId = body.tenantId?.trim()
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId required' })
  }

  const token = await getActiveOrgToken(event)
  const connectedTenants = await fetchXeroTenants(token.access_token)
  const selectedTenant = connectedTenants.find(tenant => tenant.tenantId === tenantId)
  if (!selectedTenant) {
    throw createError({ statusCode: 403, statusMessage: 'Tenant is outside the authenticated Xero connection list' })
  }

  await setSelectedTenant(event, selectedTenant.tenantId, selectedTenant.tenantName)
  return { ok: true }
})
