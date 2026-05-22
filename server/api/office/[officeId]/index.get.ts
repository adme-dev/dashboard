/**
 * GET /api/office/:officeId
 * Returns the office, its zones, its members, and the caller's role.
 * Requires the caller to be a member of the office.
 */

import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import type { OfficeRow, OfficeZoneRow, OfficeMemberRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id],
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  const office = await queryOne<OfficeRow>(
    `SELECT * FROM offices WHERE id = $1`,
    [officeId],
  )
  if (!office) {
    throw createError({ statusCode: 404, statusMessage: 'Office not found' })
  }

  const zones = await queryRows<OfficeZoneRow>(
    `SELECT * FROM office_zones WHERE office_id = $1 ORDER BY slug ASC`,
    [officeId],
  )

  const members = await queryRows<
    OfficeMemberRow & { name: string | null; avatar_url: string | null }
  >(
    `SELECT om.*, tm.name, tm.avatar_url
     FROM office_members om
     LEFT JOIN team_members tm ON tm.id = om.user_id
     WHERE om.office_id = $1`,
    [officeId],
  )

  return { office, zones, members, myRole: membership.role }
})
