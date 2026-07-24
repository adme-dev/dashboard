import { requireClientAuth } from '~~/server/utils/clientAuth'
import { parsePortalTrackingRange } from '~~/server/utils/tracking/portalRange'
import {
  deriveLeadHealthIssues,
  getLeadHealthSnapshot
} from '~~/server/utils/leads/leadHealth'

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const { fromDate, toDate } = parsePortalTrackingRange(event)
  const snapshot = await getLeadHealthSnapshot(clientUser.clientId, fromDate, toDate)
  const issueDetails = deriveLeadHealthIssues(snapshot, clientUser.leadCaptureMode)
  const confirmedLeads = snapshot.confirmedLeads

  return {
    mode: clientUser.leadCaptureMode,
    status: snapshot.formSubmits === 0 && confirmedLeads === 0
      ? 'inactive'
      : issueDetails.length
        ? 'attention'
        : 'healthy',
    ...snapshot,
    attributionCoverage: confirmedLeads > 0
      ? Math.round((snapshot.campaignAttributedLeads / confirmedLeads) * 100)
      : 0,
    firstTouchCoverage: confirmedLeads > 0
      ? Math.round((snapshot.firstTouchLeads / confirmedLeads) * 100)
      : 0,
    lastTouchCoverage: confirmedLeads > 0
      ? Math.round((snapshot.lastTouchLeads / confirmedLeads) * 100)
      : 0,
    browserLinkCoverage: snapshot.websiteConfirmedLeads > 0
      ? Math.round((snapshot.browserLinkedLeads / snapshot.websiteConfirmedLeads) * 100)
      : null,
    crmCoverage: clientUser.leadCaptureMode === 'full_crm' && confirmedLeads > 0
      ? Math.round((snapshot.crmLinkedLeads / confirmedLeads) * 100)
      : null,
    issues: issueDetails.map(issue => issue.message),
    issueDetails
  }
})
