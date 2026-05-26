/**
 * POST /api/office/:officeId/lobbies
 * Admin-only: create a persistent public lobby handle.
 */
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { ensureOfficeLobbiesTable, normalizeOfficeLobbyHandle } from '~~/server/utils/officeLobbies'
import { getOfficeSettings } from '~~/server/utils/officeSettings'
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
  handle: z.string().min(2).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  destination_zone_id: z.string().uuid().nullable().optional(),
  is_active: z.boolean().optional(),
  config: Config.optional()
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const { user } = await requireOfficeAdmin(event, officeId)
  await ensureOfficeLobbiesTable()
  const settings = await getOfficeSettings(officeId)
  if (!settings?.guest_access_enabled || !settings.public_lobbies_enabled) {
    throw createError({ statusCode: 403, statusMessage: 'Public lobbies are disabled for this office' })
  }

  const body = Body.parse(await readBody(event))
  const handle = normalizeOfficeLobbyHandle(body.handle)
  if (handle.length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Handle must include at least 3 letters or numbers' })
  }
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

  const lobby = await queryOne<OfficeLobbyRow>(
    `INSERT INTO office_lobbies (
       office_id, owner_user_id, handle, name, description, destination_zone_id, is_active, config
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      officeId,
      user.id,
      handle,
      body.name,
      body.description ?? '',
      body.destination_zone_id ?? null,
      body.is_active ?? true,
      JSON.stringify(body.config ?? {})
    ]
  )

  if (!lobby) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create lobby' })
  }

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'lobby.created',
    targetType: 'office_lobby',
    targetId: lobby.id,
    metadata: {
      handle: lobby.handle,
      destinationZoneId: lobby.destination_zone_id
    }
  })

  return { lobby }
})
