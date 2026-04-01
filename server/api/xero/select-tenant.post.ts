import { setOrgTenant } from '../../utils/tokenStore'

export default eventHandler(async (event) => {
  const body = await readBody<{ tenantId?: string; tenantName?: string }>(event)
  const tenantId = body.tenantId
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'tenantId required' })
  }
  await setOrgTenant(event, tenantId, body.tenantName || '')
  return { ok: true }
})
