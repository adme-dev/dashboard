/**
 * GET /api/office/:officeId
 * Returns the office, its zones, its members, and the caller's role.
 * Requires the caller to be a member of the office.
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { allocateDesk } from '~~/server/utils/office/allocateDesk'
import type { OfficeRow, OfficeZoneRow, OfficeMemberRow, OfficeMember } from '~~/app/types/office'

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
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const office = await queryOne<OfficeRow>(
    `SELECT * FROM offices WHERE id = $1`,
    [officeId]
  )
  if (!office) {
    throw createError({ statusCode: 404, statusMessage: 'Office not found' })
  }

  const zones = await queryRows<OfficeZoneRow>(
    `SELECT * FROM office_zones WHERE office_id = $1 ORDER BY slug ASC`,
    [officeId]
  )

  const members = await queryRows<{
    userId: string
    name: string
    avatarUrl: string | null
    role: string
    deskZoneId: string | null
    lastSeenAt: string | null
  }>(
    `SELECT
        u.id           AS "userId",
        u.name,
        u.avatar_url   AS "avatarUrl",
        om.role,
        dz.id          AS "deskZoneId",
        ucs.last_seen_at AS "lastSeenAt"
      FROM office_members om
      JOIN team_members u ON u.id = om.user_id
      LEFT JOIN office_zones dz
        ON dz.office_id = om.office_id
       AND dz.zone_type = 'desk'
       AND dz.assigned_user_id = u.id
      LEFT JOIN user_chat_status ucs ON ucs.user_id = u.id
      WHERE om.office_id = $1
        AND om.user_id IS NOT NULL`,
    [officeId]
  )

  // Lazy backfill: any staff member without a desk gets one allocated now.
  // Idempotent — allocateDesk returns the existing row if one already exists.
  const missing = members.filter(m => !m.deskZoneId)
  if (missing.length > 0) {
    for (const m of missing) {
      try {
        const desk = await allocateDesk(officeId, m.userId)
        m.deskZoneId = desk.id
        zones.push(desk)
      } catch (err) {
        console.error('[office] lazy desk backfill failed', { officeId, userId: m.userId, err })
      }
    }
  }

  return { office, zones, myRole: membership.role, members }
})
