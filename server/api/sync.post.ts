import { getSelectedTenant } from '../utils/session'
import { invalidatePrefix } from '../utils/cache'

export default eventHandler(async (event) => {
  const tenantId = getSelectedTenant(event)
  const prefix = tenantId ? `kpis:${tenantId}` : 'kpis:'
  await invalidatePrefix(prefix)
  return { ok: true }
})
