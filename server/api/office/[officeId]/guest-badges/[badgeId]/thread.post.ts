/**
 * POST /api/office/:officeId/guest-badges/:badgeId/thread
 * Create or return the persistent chat thread for an office guest badge.
 */
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { ensureOfficeGuestBadgesTable } from '~~/server/utils/officeGuestBadges'
import { ensureOfficeGuestThreadChannel } from '~~/server/utils/officeThreads'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const badgeId = getRouterParam(event, 'badgeId')

  if (!officeId || !badgeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and badgeId are required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  await ensureOfficeGuestBadgesTable()
  const channel = await ensureOfficeGuestThreadChannel({
    officeId,
    badgeId,
    actorId: user.id
  })
  if (!channel) {
    throw createError({ statusCode: 404, statusMessage: 'Guest badge not found' })
  }

  return channel
})
