import { invalidatePrefix } from '../../utils/cache'

export default eventHandler(async (event) => {
  // Xero webhooks typically include tenantId in headers or body depending on setup.
  const tenantId = getHeader(event, 'xero-tenant-id') || (await readBody<any>(event))?.tenantId
  if (tenantId) {
    await invalidatePrefix(`kpis:${tenantId}`)
  }
  return { ok: true }
})
