import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getIdentityReconciliationSnapshot } from '~~/server/utils/persona/reconciliation'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  if (client.leadCaptureMode !== 'full_crm') {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      healthy: false,
      metrics: null,
      cases: [],
      recentConflicts: []
    }
  }
  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')
  const snapshot = await getIdentityReconciliationSnapshot(client.clientId)
  return {
    enabled: true,
    ...snapshot,
    recentConflicts: snapshot.recentConflicts.map(({ profileId, source, occurredAt }) => ({
      profileId,
      source,
      occurredAt
    }))
  }
})
