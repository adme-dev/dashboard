/**
 * PATCH /api/office/:officeId/guest-badges/:badgeId
 * Admin-only guest badge lifecycle controls.
 */
import { z } from 'zod'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { updateOfficeGuestBadgeStatus } from '~~/server/utils/officeGuestBadges'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'

const Body = z.object({
  action: z.enum(['revoke', 'expire', 'reactivate']),
  expires_at: z.string().datetime().optional()
})

const DEFAULT_REACTIVATION_HOURS = 2

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const badgeId = getRouterParam(event, 'badgeId')
  if (!officeId || !badgeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and badgeId required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))
  const status = body.action === 'reactivate'
    ? 'active'
    : body.action === 'expire'
      ? 'expired'
      : 'revoked'
  const expiresAt = body.action === 'reactivate'
    ? body.expires_at ?? new Date(Date.now() + DEFAULT_REACTIVATION_HOURS * 60 * 60 * 1000).toISOString()
    : undefined
  if (body.action === 'reactivate' && expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw createError({ statusCode: 400, statusMessage: 'Guest badge expiry must be in the future' })
  }

  const badge = await updateOfficeGuestBadgeStatus({
    officeId,
    badgeId,
    status,
    actorId: user.id,
    expiresAt
  })

  if (!badge) {
    throw createError({
      statusCode: 404,
      statusMessage: body.action === 'reactivate'
        ? 'Guest badge not found or missing an approved room'
        : 'Guest badge not found'
    })
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: `guest_badge.${status}`,
    targetType: 'office_guest_badge',
    targetId: badge.id,
    metadata: {
      guestEmail: badge.guest_email,
      allowedZoneId: badge.allowed_zone_id,
      expiresAt: badge.expires_at
    }
  })

  return { badge }
})
