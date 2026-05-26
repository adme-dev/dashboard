/**
 * GET /api/office/:officeId/guest-badges
 * Admin-only list of recent guest access badges.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeGuestBadgesTable } from '~~/server/utils/officeGuestBadges'
import { canAdministerOffice } from '~~/server/utils/officeRoom'
import type { OfficeGuestBadgeRow, OfficeMemberRow } from '~~/app/types/office'

type GuestBadgeWithZone = OfficeGuestBadgeRow & {
  zone_name: string | null
  zone_slug: string | null
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!canAdministerOffice(user, membership)) {
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  }

  await ensureOfficeGuestBadgesTable()
  await queryOne(
    `UPDATE office_guest_badges
     SET status = 'expired',
         revoked_at = COALESCE(revoked_at, now()),
         updated_at = now()
     WHERE office_id = $1
       AND status = 'active'
       AND expires_at <= now()
     RETURNING id`,
    [officeId]
  )

  const badges = await queryRows<GuestBadgeWithZone>(
    `SELECT ogb.*,
            z.name AS zone_name,
            z.slug AS zone_slug
     FROM office_guest_badges ogb
     LEFT JOIN office_zones z ON z.id = ogb.allowed_zone_id
     WHERE ogb.office_id = $1
     ORDER BY ogb.created_at DESC
     LIMIT 100`,
    [officeId]
  )

  return { badges }
})
