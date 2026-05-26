/**
 * GET /api/public/office-lobby/handle/:handle
 * Resolve a friendly lobby handle into its office and destination.
 */
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeLobbiesTable, normalizeOfficeLobbyHandle } from '~~/server/utils/officeLobbies'
import type { OfficeLobbyRow } from '~~/app/types/office'

type PublicLobby = Pick<
  OfficeLobbyRow,
  'id' | 'office_id' | 'handle' | 'name' | 'description' | 'destination_zone_id' | 'config'
> & {
  office_name: string
  destination_zone_slug: string | null
  destination_zone_name: string | null
}

export default defineEventHandler(async (event) => {
  const rawHandle = getRouterParam(event, 'handle')
  if (!rawHandle) {
    throw createError({ statusCode: 400, statusMessage: 'handle required' })
  }

  await ensureOfficeLobbiesTable()
  const handle = normalizeOfficeLobbyHandle(rawHandle)
  if (!handle) {
    throw createError({ statusCode: 400, statusMessage: 'valid handle required' })
  }
  const lobby = await queryOne<PublicLobby>(
    `SELECT
       ol.id,
       ol.office_id,
       ol.handle,
       ol.name,
       ol.description,
       ol.destination_zone_id,
       ol.config,
       o.name AS office_name,
       oz.slug AS destination_zone_slug,
       oz.name AS destination_zone_name
     FROM office_lobbies ol
     JOIN offices o ON o.id = ol.office_id
     LEFT JOIN office_zones oz ON oz.id = ol.destination_zone_id
     WHERE lower(ol.handle) = lower($1)
       AND ol.is_active = true
     LIMIT 1`,
    [handle]
  )

  if (!lobby) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby not found' })
  }

  return { lobby }
})
