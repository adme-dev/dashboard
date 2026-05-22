/**
 * POST /api/office/:officeId/zones
 * Admin-only: create a zone on the office floor plan.
 * Also pre-creates the matching chat_channels row for Phase 1c chat.
 */

import { z } from 'zod'
import { execute, queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

const Body = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/).max(64),
  name: z.string().min(1).max(120),
  zone_type: z.enum(['lobby', 'meeting', 'focus', 'theater', 'client_lounge']),
  position: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive()
  }),
  capacity: z.number().int().positive().default(20),
  is_private: z.boolean().default(false),
  acl: z
    .object({
      allowed_roles: z.array(z.string()).optional(),
      allowed_clients: z.array(z.string().uuid()).optional(),
      public_lobby: z.boolean().optional()
    })
    .default({})
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  const zone = await queryOne<{ id: string }>(
    `INSERT INTO office_zones (office_id, slug, name, zone_type, position, capacity, is_private, acl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      officeId,
      body.slug,
      body.name,
      body.zone_type,
      JSON.stringify(body.position),
      body.capacity,
      body.is_private,
      JSON.stringify(body.acl)
    ]
  )

  if (!zone) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create zone' })
  }

  // Pre-create the chat channel for this zone (Phase 1c writes into it)
  await execute(
    `INSERT INTO chat_channels (name, slug, type, external_id, created_by)
     VALUES ($1, $2, 'office_zone', $3,
       (SELECT id FROM team_members WHERE user_role = 'owner' ORDER BY created_at ASC LIMIT 1))
     ON CONFLICT DO NOTHING`,
    [body.name, `office-${body.slug}`, zone.id]
  )

  return { id: zone.id }
})
