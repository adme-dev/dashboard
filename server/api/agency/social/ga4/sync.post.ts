import { requireAuth } from '~~/server/utils/auth'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { syncGa4 } from '~~/server/utils/ga4Sync'

/**
 * POST /api/agency/social/ga4/sync
 * Kicks off a GA4 metrics sync in the background and returns immediately.
 * Body: { clientId?: string, lookbackDays?: number }
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event).catch(() => null)
  const clientId = body?.clientId as string | undefined
  const lookbackDays = typeof body?.lookbackDays === 'number' ? body.lookbackDays : 14

  return runSpendSyncInBackground(event, {
    label: `ga4 sync ${clientId || 'all'}`,
    sync: () => syncGa4({ clientId, lookbackDays }),
    kvKeys: []
  })
})
