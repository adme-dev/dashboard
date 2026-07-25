import { requireClientAuth } from '~~/server/utils/clientAuth'
import { getPersonaExportOperationsSnapshot } from '~~/server/utils/persona/exportOperations'

export default defineEventHandler(async event => {
  const client = await requireClientAuth(event)
  if (!client.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }

  const snapshot = await getPersonaExportOperationsSnapshot(client.clientId)
  setHeader(event, 'Cache-Control', 'private, max-age=30, stale-while-revalidate=120')

  return {
    ...snapshot,
    recent: snapshot.recent.map(item => ({
      provider: item.provider,
      operation: item.operation,
      status: item.status,
      attemptCount: item.attemptCount,
      attemptedAdditions: item.attemptedAdditions,
      attemptedRemovals: item.attemptedRemovals,
      successfulAdditions: item.successfulAdditions,
      successfulRemovals: item.successfulRemovals,
      errorCode: item.errorCode,
      queuedAt: item.queuedAt,
      completedAt: item.completedAt,
      updatedAt: item.updatedAt,
    })),
  }
})

