import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { syncGa4 } from '~~/server/utils/ga4Sync'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * POST /api/agency/social/ga4/sync
 * Kicks off a GA4 metrics sync in the background and returns immediately.
 * Body: { clientId?: string, lookbackDays?: number, startDate?: string, endDate?: string }
 * Passing startDate+endDate (YYYY-MM-DD) backfills that arbitrary range verbatim;
 * otherwise lookbackDays applies (default 14, always re-pulls the trailing ~48h).
 */
export default eventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const body = await readBody(event).catch(() => null)
  const clientId = body?.clientId as string | undefined
  const lookbackDays = typeof body?.lookbackDays === 'number' ? body.lookbackDays : 14

  // Explicit backfill range (both required, validated as ISO dates).
  let startDate: string | undefined
  let endDate: string | undefined
  if (typeof body?.startDate === 'string' && typeof body?.endDate === 'string') {
    if (!ISO_DATE.test(body.startDate) || !ISO_DATE.test(body.endDate)) {
      throw createError({ statusCode: 400, statusMessage: 'startDate and endDate must be YYYY-MM-DD' })
    }
    if (body.startDate > body.endDate) {
      throw createError({ statusCode: 400, statusMessage: 'startDate must be on or before endDate' })
    }
    startDate = body.startDate
    endDate = body.endDate
  }

  const label = startDate
    ? `ga4 backfill ${clientId || 'all'} ${startDate}..${endDate}`
    : `ga4 sync ${clientId || 'all'}`

  return runSpendSyncInBackground(event, {
    label,
    sync: () => syncGa4({ clientId, lookbackDays, startDate, endDate }),
    kvKeys: []
  })
})
