/**
 * PATCH /api/office/:officeId/lobbies/:lobbyId
 * Admin-only: update a persistent public lobby handle.
 */
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { ensureOfficeLobbiesTable, normalizeOfficeLobbyHandle } from '~~/server/utils/officeLobbies'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import type { OfficeLobbyRow } from '~~/app/types/office'

const HexColor = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)

const ShelfItem = z.object({
  label: z.string().trim().min(1).max(40),
  value: z.string().trim().min(1).max(140),
  url: z.string().url().optional()
})

const AvailabilityWindow = z.object({
  days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().trim().min(1).max(80).optional()
})

const Config = z.object({
  destination_zone_id: z.string().uuid().nullable().optional(),
  availability_mode: z.enum(['manual', 'office_presence', 'scheduled']).optional(),
  event_duration_minutes: z.number().int().min(5).max(240).optional(),
  minimum_notice_minutes: z.number().int().min(0).max(1440).optional(),
  daily_cap: z.number().int().min(1).max(200).optional(),
  intake_fields: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().min(1).max(120),
    type: z.enum(['text', 'email', 'textarea', 'select']),
    required: z.boolean().optional(),
    options: z.array(z.string().max(120)).optional()
  })).optional(),
  brand: z.object({
    logo_url: z.string().url().optional(),
    background: HexColor.optional(),
    texture: z.enum(['dots', 'grid', 'mesh', 'none']).optional(),
    verified: z.boolean().optional()
  }).optional(),
  shelf_items: z.array(ShelfItem).max(6).optional(),
  availability_windows: z.array(AvailabilityWindow).max(14).optional()
}).passthrough()

const Body = z.object({
  handle: z.string().min(2).max(80).optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).optional(),
  destination_zone_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  config: Config.optional()
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  const lobbyId = getRouterParam(event, 'lobbyId')
  if (!officeId || !lobbyId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId and lobbyId are required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  await ensureOfficeLobbiesTable()
  const body = Body.parse(await readBody(event))

  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  if (body.handle !== undefined) {
    const handle = normalizeOfficeLobbyHandle(body.handle)
    if (handle.length < 3) {
      throw createError({ statusCode: 400, statusMessage: 'Handle must include at least 3 letters or numbers' })
    }
    sets.push(`handle = $${i++}`)
    params.push(handle)
  }
  if (body.name !== undefined) {
    sets.push(`name = $${i++}`)
    params.push(body.name)
  }
  if (body.description !== undefined) {
    sets.push(`description = $${i++}`)
    params.push(body.description)
  }
  if (body.destination_zone_id !== undefined) {
    if (body.destination_zone_id) {
      const destinationZone = await queryOne<{ id: string }>(
        `SELECT id
         FROM office_zones
         WHERE id = $1
           AND office_id = $2
           AND zone_type <> 'desk'`,
        [body.destination_zone_id, officeId]
      )
      if (!destinationZone) {
        throw createError({ statusCode: 404, statusMessage: 'Destination room not found' })
      }
    }
    sets.push(`destination_zone_id = $${i++}`)
    params.push(body.destination_zone_id)
  }
  if (body.is_active !== undefined) {
    sets.push(`is_active = $${i++}`)
    params.push(body.is_active)
  }
  if (body.config !== undefined) {
    sets.push(`config = $${i++}`)
    params.push(JSON.stringify(body.config))
  }

  if (sets.length === 0) return { updated: 0 }

  params.push(lobbyId, officeId)
  const lobby = await queryOne<OfficeLobbyRow>(
    `UPDATE office_lobbies
     SET ${sets.join(', ')}
     WHERE id = $${i++} AND office_id = $${i}
     RETURNING *`,
    params
  )

  if (!lobby) {
    throw createError({ statusCode: 404, statusMessage: 'Lobby not found' })
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'lobby.updated',
    targetType: 'office_lobby',
    targetId: lobby.id,
    metadata: {
      changed: Object.keys(body),
      handle: lobby.handle,
      destinationZoneId: lobby.destination_zone_id,
      config: body.config ?? null
    }
  })

  return { updated: 1, lobby }
})
