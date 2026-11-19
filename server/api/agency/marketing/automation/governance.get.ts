import { requireAuth } from '~~/server/utils/auth'
import { readAdsGovernanceOverview } from '~~/server/utils/adsGovernance/overview'

// Read-only view of ads automation governance (kill switch, limits, rule registry). Dormant: returns
// `{ enabled: false }` without touching the database while the governance switch is off.
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  return readAdsGovernanceOverview(event, user.id, {
    clientId: typeof query.clientId === 'string' ? query.clientId : undefined,
    ruleId: typeof query.ruleId === 'string' ? query.ruleId : undefined
  })
})
