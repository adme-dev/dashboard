/**
 * GET /api/office/:officeId/lobbies
 * Admin-only lobby definitions for an office.
 */
import { queryRows } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import type { OfficeLobbyRow } from '~~/app/types/office'

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  await requireOfficeAdmin(event, officeId)
  await ensureOfficeLobbiesTable()

  const lobbies = await queryRows<OfficeLobbyRow & { destination_zone_name: string | null }>(
    `SELECT ol.*, oz.name AS destination_zone_name
     FROM office_lobbies ol
     LEFT JOIN office_zones oz ON oz.id = ol.destination_zone_id
     WHERE ol.office_id = $1
     ORDER BY ol.created_at DESC`,
    [officeId]
  )

  return { lobbies }
})
