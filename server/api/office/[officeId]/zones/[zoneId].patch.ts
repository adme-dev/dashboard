/**
 * PATCH /api/office/:officeId/zones/:zoneId
 * Admin-only: update mutable zone fields. Dynamic SET clause from supplied
 * keys; omitted keys are not touched.
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
  slug: ZoneSlugSchema.optional(),
  name: ZoneNameSchema.optional(),
  zone_type: ZoneTypeSchema.optional(),
  position: ZonePositionSchema.optional(),
  capacity: ZoneCapacitySchema.optional(),
  is_private: z.boolean().optional(),
  acl: ZoneAclSchema.optional()
})

async function syncLiveZoneUpserted(event: Parameters<typeof getRouterParam>[0], officeId: string, zoneId: string) {
  const zone = await queryOne<OfficeZoneRow>(
    `SELECT *
     FROM office_zones
     WHERE office_id = $1 AND id = $2`,
    [officeId, zoneId]
  )
  if (!zone) return
  await notifyOfficeZoneUpserted(event, officeId, zone)
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  const { user } = await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  if (body.slug !== undefined) {
    const existingZone = await queryOne<{ id: string }>(
      `SELECT id
       FROM office_zones
       WHERE office_id = $1 AND slug = $2 AND id <> $3`,
      [officeId, body.slug, zoneId]
    )
    if (existingZone) {
      throw createError({ statusCode: 409, statusMessage: 'Room slug already exists' })
    }
  }

  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (body.name !== undefined) {
    sets.push(`name = $${i++}`)
    params.push(body.name)
  }
  if (body.slug !== undefined) {
    sets.push(`slug = $${i++}`)
    params.push(body.slug)
  }
  if (body.zone_type !== undefined) {
    sets.push(`zone_type = $${i++}`)
    params.push(body.zone_type)
  }
  if (body.position !== undefined) {
    sets.push(`position = $${i++}`)
    params.push(JSON.stringify(body.position))
  }
  if (body.capacity !== undefined) {
    sets.push(`capacity = $${i++}`)
    params.push(body.capacity)
  }
  if (body.is_private !== undefined) {
    sets.push(`is_private = $${i++}`)
    params.push(body.is_private)
  }
  if (body.acl !== undefined) {
    sets.push(`acl = $${i++}`)
    params.push(JSON.stringify(body.acl))
  }

  if (sets.length === 0) return { updated: 0 }

  params.push(zoneId, officeId)
  const updated = await execute(
    `UPDATE office_zones SET ${sets.join(', ')} WHERE id = $${i++} AND office_id = $${i}`,
    params
  )
  if (updated === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Zone not found' })
  }
  await syncLiveZoneUpserted(event, officeId, zoneId)
  await logOfficeAuditEvent({
    officeId,
    actorId: user.id,
    action: 'zone.updated',
    targetType: 'office_zone',
    targetId: zoneId,
    metadata: {
      changed: Object.keys(body),
      name: body.name ?? null,
      slug: body.slug ?? null,
      zone_type: body.zone_type ?? null,
      capacity: body.capacity ?? null,
      is_private: body.is_private ?? null,
      acl: body.acl ?? null,
      position: body.position ?? null
    }
  })
  return { updated: 1 }
})
