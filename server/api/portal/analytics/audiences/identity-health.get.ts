import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getIdentityReconciliationSnapshot } from '~~/server/utils/persona/reconciliation'

const rate = (numerator: number, denominator: number) => denominator > 0
  ? Math.round((numerator / denominator) * 10_000) / 100
  : 0

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const snapshot = await getIdentityReconciliationSnapshot(client.clientId)
  const activeCases = snapshot.cases.filter(item => ['open', 'in_review', 'approved'].includes(item.status))
  const highRiskCases = activeCases.filter(item => ['high', 'critical'].includes(item.riskLevel)).length
  const linkedLeadTotal = snapshot.metrics.linkedLeads + snapshot.metrics.leadsWithoutIdentity
  const consentTotal = snapshot.metrics.profiles + snapshot.metrics.unlinkedConsent
  const caseStatuses = activeCases.reduce<Record<string, number>>((result, item) => {
    result[item.status] = (result[item.status] || 0) + 1
    return result
  }, {})
  const riskLevels = activeCases.reduce<Record<string, number>>((result, item) => {
    result[item.riskLevel] = (result[item.riskLevel] || 0) + 1
    return result
  }, {})

  const status = highRiskCases > 0 || snapshot.metrics.unmatchedSubmissions > 0
    ? 'action_required'
    : snapshot.metrics.openCases > 0
      || snapshot.metrics.leadsWithoutIdentity > 0
      || snapshot.metrics.unlinkedConsent > 0
      ? 'attention'
      : 'healthy'

  const recommendations: Array<{ code: string, message: string }> = []
  if (snapshot.metrics.unmatchedSubmissions > 0) {
    recommendations.push({
      code: 'submission_reconciliation',
      message: `${snapshot.metrics.unmatchedSubmissions} website submission(s) still require confirmed-lead reconciliation.`,
    })
  }
  if (snapshot.metrics.leadsWithoutIdentity > 0) {
    recommendations.push({
      code: 'lead_identity_linkage',
      message: `${snapshot.metrics.leadsWithoutIdentity} lead(s) are not linked to a canonical identity profile.`,
    })
  }
  if (snapshot.metrics.unlinkedConsent > 0) {
    recommendations.push({
      code: 'consent_identity_linkage',
      message: `${snapshot.metrics.unlinkedConsent} consent decision(s) remain anonymous and cannot yet enrich a known customer profile.`,
    })
  }
  if (highRiskCases > 0) {
    recommendations.push({
      code: 'high_risk_review',
      message: `${highRiskCases} high-risk identity case(s) require agency review before resolution.`,
    })
  }

  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')

  return {
    generatedAt: snapshot.generatedAt,
    status,
    healthy: status === 'healthy',
    metrics: {
      profiles: snapshot.metrics.profiles,
      identityKeys: snapshot.metrics.identityKeys,
      linkedLeads: snapshot.metrics.linkedLeads,
      leadsWithoutIdentity: snapshot.metrics.leadsWithoutIdentity,
      anonymousSignals: snapshot.metrics.anonymousSignals,
      unlinkedConsent: snapshot.metrics.unlinkedConsent,
      unmatchedSubmissions: snapshot.metrics.unmatchedSubmissions,
      openCases: snapshot.metrics.openCases,
      highRiskCases,
      appliedResolutions: snapshot.metrics.appliedResolutions,
      leadLinkageRate: rate(snapshot.metrics.linkedLeads, linkedLeadTotal),
      consentLinkageRate: rate(snapshot.metrics.profiles, consentTotal),
    },
    caseStatuses,
    riskLevels,
    recommendations,
    governance: {
      deterministicMatching: true,
      twoPersonApproval: true,
      versionedResolutions: true,
      rollbackSupported: true,
      clientMergeAccess: false,
    },
  }
})

