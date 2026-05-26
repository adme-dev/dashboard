/**
 * GET /api/public/office-lobby/:officeId
 * Public prejoin data for external office guests.
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { ensureOfficeLobbiesTable } from '~~/server/utils/officeLobbies'
import { ensureOfficeMeetingArtifactsTables } from '~~/server/utils/officeMeetingArtifacts'
import { ensureOfficePresenceLocationsTable } from '~~/server/utils/officePresenceLocations'
import type { OfficeLobbyConfig, OfficeLobbyRow, OfficeRow, OfficeZoneRow } from '~~/app/types/office'

type PublicLobbyInfo = Pick<
  OfficeLobbyRow,
  'id' | 'handle' | 'name' | 'description' | 'destination_zone_id' | 'config'
> & {
  destination_zone_slug: string | null
  destination_zone_name: string | null
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }
  const query = getQuery(event)
  const lobbyHandle = typeof query.lobby === 'string' ? query.lobby : ''
  const meetingId = typeof query.meeting === 'string' ? query.meeting : ''
  if (lobbyHandle) await ensureOfficeLobbiesTable()
  if (meetingId) await ensureOfficeMeetingArtifactsTables()

  const office = await queryOne<Pick<OfficeRow, 'id' | 'name'>>(
    `SELECT id, name FROM offices WHERE id = $1`,
    [officeId]
  )
  if (!office) {
    throw createError({ statusCode: 404, statusMessage: 'Office not found' })
  }

  const zones = await queryRows<Pick<OfficeZoneRow, 'id' | 'slug' | 'name' | 'zone_type' | 'capacity'>>(
    `SELECT id, slug, name, zone_type, capacity
     FROM office_zones
     WHERE office_id = $1
       AND zone_type <> 'desk'
     ORDER BY
       CASE zone_type
         WHEN 'lobby' THEN 0
         WHEN 'meeting' THEN 1
         WHEN 'focus' THEN 2
         ELSE 3
       END,
       name ASC`,
    [officeId]
  )

  const lobby = lobbyHandle
    ? await queryOne<PublicLobbyInfo>(
        `SELECT ol.id,
                ol.handle,
                ol.name,
                ol.description,
                ol.destination_zone_id,
                ol.config,
                oz.slug AS destination_zone_slug,
                oz.name AS destination_zone_name
         FROM office_lobbies ol
         LEFT JOIN office_zones oz ON oz.id = ol.destination_zone_id
         WHERE ol.office_id = $1
           AND lower(ol.handle) = lower($2)
           AND ol.is_active = true
         LIMIT 1`,
        [officeId, lobbyHandle]
      )
    : null

  if (lobbyHandle && !lobby) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby link not found' })
  }

  const meeting = meetingId
    ? await queryOne<{
        id: string
        title: string
        zone_id: string | null
        zone_slug: string | null
        zone_name: string | null
        scheduled_start_at: string | null
        duration_minutes: number | null
        intake_prompt: string | null
      }>(
        `SELECT oms.id,
                oms.title,
                oms.zone_id,
                oz.slug AS zone_slug,
                oz.name AS zone_name,
                oms.consent #>> '{setup,scheduled_start_at}' AS scheduled_start_at,
                NULLIF(oms.consent #>> '{setup,duration_minutes}', '')::int AS duration_minutes,
                NULLIF(oms.consent #>> '{setup,intake_prompt}', '') AS intake_prompt
         FROM office_meeting_sessions oms
         LEFT JOIN office_zones oz ON oz.id = oms.zone_id
         WHERE oms.id = $1
           AND oms.office_id = $2
           AND oms.status IN ('planned', 'live')
         LIMIT 1`,
        [meetingId, officeId]
      )
    : null

  if (meetingId && !meeting) {
    throw createError({ statusCode: 404, statusMessage: 'Meeting invite not found' })
  }

  let onlineStaffCount = 0
  if (lobby?.config?.availability_mode === 'office_presence') {
    await ensureOfficePresenceLocationsTable()
    const presence = await queryOne<{ online_staff_count: number }>(
      `SELECT COUNT(*)::int AS online_staff_count
       FROM office_presence_locations opl
       JOIN office_members om
         ON om.office_id = opl.office_id
        AND om.user_id = opl.actor_id
       WHERE opl.office_id = $1
         AND opl.actor_type = 'user'
         AND opl.presence = 'online'
         AND opl.last_seen_at > now() - interval '90 seconds'`,
      [officeId]
    )
    onlineStaffCount = presence?.online_staff_count ?? 0
  }

  const config: OfficeLobbyConfig = lobby?.config ?? {}
  const mode = config.availability_mode ?? 'manual'
  const isAvailable = !lobby || mode === 'manual' || mode === 'scheduled' || onlineStaffCount > 0

  return {
    office,
    zones,
    lobby,
    meeting,
    availability: lobby
      ? {
          mode,
          isAvailable,
          reason: isAvailable ? null : 'No hosts are currently available for drop-ins.',
          onlineStaffCount,
          eventDurationMinutes: config.event_duration_minutes ?? 30,
          minimumNoticeMinutes: config.minimum_notice_minutes ?? 0,
          dailyCap: config.daily_cap ?? null,
          availabilityWindows: config.availability_windows ?? []
        }
      : null
  }
})
