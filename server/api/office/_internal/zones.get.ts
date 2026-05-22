/**
 * GET /api/office/_internal/zones?officeId=...
 * INTERNAL: called by the OfficeRoom DO to populate its capacity + meeting cache.
 */
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-office-sync-secret')
  if (!secret || secret !== process.env.OFFICE_SYNC_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const officeId = getQuery(event).officeId as string | undefined
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  const zones = await queryRows<{
    id: string
    capacity: number
    cf_meeting_id: string | null
    cf_preset_default: string
  }>(
    `SELECT id, capacity, cf_meeting_id, cf_preset_default
     FROM office_zones WHERE office_id = $1`,
    [officeId],
  )
  return { zones }
})
