import { loadSearchAuthorityMeasurement, portalSearchAuthorityOutcomes } from '~~/server/utils/searchAuthority/measurement'
import { requirePortalSearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { searchConsoleOpportunityWindow } from '~~/server/utils/searchAuthority/dates'

export default eventHandler(async (event) => {
  const user = await requirePortalSearchAuthorityAccess(event)
  const summary = await loadSearchAuthorityMeasurement(
    user.clientId,
    searchConsoleOpportunityWindow()
  )
  return portalSearchAuthorityOutcomes(summary)
})
