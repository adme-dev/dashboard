/**
 * POST /api/office/_internal/meeting
 * INTERNAL: called by OfficeRoom DO to persist a cf_meeting_id after lazy creation.
 * Body: { zoneId: string, meetingId: string }
 *
 * The WHERE cf_meeting_id IS NULL guard ensures concurrent creates don't clobber
 * each other; first writer wins, others silently no-op.
 *
 * Auth: x-office-sync-secret header, constant-time compared against
 * OFFICE_SYNC_SECRET env var (works in both CF Pages prod and local Nitro dev).
 */
import { execute } from '~~/server/utils/db'
import { isAuthorizedSyncRequest } from '~~/server/utils/officeSyncAuth'

export default defineEventHandler(async (event) => {
  if (!isAuthorizedSyncRequest(event, getHeader(event, 'x-office-sync-secret'))) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }
  const { zoneId, meetingId } = await readBody(event) as { zoneId?: string, meetingId?: string }
  if (!zoneId || !meetingId) {
    throw createError({ statusCode: 400, statusMessage: 'zoneId and meetingId required' })
  }
  await execute(
    `UPDATE office_zones SET cf_meeting_id = $1 WHERE id = $2 AND cf_meeting_id IS NULL`,
    [meetingId, zoneId],
  )
  return { ok: true }
})
