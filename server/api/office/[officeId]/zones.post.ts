/**
 * POST /api/office/:officeId/zones
 * Admin-only: create a zone on the office floor plan.
 * Also pre-creates the matching chat_channels row for Phase 1c chat.
 */

import { z } from 'zod'
import { execute, queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'
import { logOfficeAuditEvent } from '~~/server/utils/officeAudit'
import { notifyOfficeZoneUpserted } from '~~/server/utils/officeRoomControl'
import type { OfficeZoneRow } from '~~/app/types/office'
import {
  ZoneAclSchema,
  ZoneCapacitySchema,
  ZoneNameSchema,
  ZonePositionSchema,
  ZoneSlugSchema,
  ZoneTypeSchema
} from '~~/server/utils/officeZoneValidation'

const Body = z.object({
  slug: ZoneSlugSchema,
  name: ZoneNameSchema,
  zone_type: ZoneTypeSchema,
  position: ZonePositionSchema,
  capacity: ZoneCapacitySchema.default(20),
  is_private: z.boolean().default(false),
  acl: ZoneAclSchema.default({})
})

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const { user } = await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  const existingZone = await queryOne<{ id: string }>(
    `SELECT id
     FROM office_zones
     WHERE office_id = $1 AND slug = $2`,
    [officeId, body.slug]
  )
  if (existingZone) {
    throw createError({ statusCode: 409, statusMessage: 'Room slug already exists' })
  }

  const zone = await queryOne<OfficeZoneRow>(
    `INSERT INTO office_zones (office_id, slug, name, zone_type, position, capacity, is_private, acl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
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
    `INSERT INTO chat_channels (name, slug, description, type, is_private, external_id, created_by)
     VALUES ($1, $2, $3, 'office_zone', true, $4, $5)
     ON CONFLICT DO NOTHING`,
    [
      body.name,
      `office-zone-${zone.id}`,
      `Persistent room thread for ${body.name}`,
      zone.id,
      user.id
    ]
  )

  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'zone.created',
    targetType: 'office_zone',
    targetId: zone.id,
    metadata: {
      slug: body.slug,
      name: body.name,
      zone_type: body.zone_type,
      capacity: body.capacity,
      is_private: body.is_private,
      acl: body.acl,
      position: body.position
    }
  })
  await notifyOfficeZoneUpserted(event, officeId, zone)

  return { id: zone.id }
})
