/**
 * POST /api/office/:officeId/recordings/:recordingId/thread
 * Create or return the persistent chat thread for an office recording.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeRecordingsTables } from '~~/server/utils/officeRecordings'
import { ensureOfficeRecordingThreadChannel } from '~~/server/utils/officeThreads'
import type { OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  const recordingId = getRouterParam(event, 'recordingId')

  if (!officeId || !recordingId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and recordingId are required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeRecordingsTables()
  const channel = await ensureOfficeRecordingThreadChannel({
    officeId,
    recordingId,
    actorId: user.id
  })
  if (!channel) {
    throw createError({ statusCode: 404, statusMessage: 'Recording not found' })
  }

  return channel
})
