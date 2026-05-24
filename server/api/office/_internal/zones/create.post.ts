import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { isAuthorizedSyncRequest } from '~~/server/utils/officeSyncAuth'
import type { OfficeZoneRow } from '~~/app/types/office'

const Body = z.object({
  officeId: z.string().uuid(),
  anchorZoneId: z.string().uuid(),
  zoneType: z.literal('adhoc'),
  capacity: z.number().int().min(2).max(16).default(8),
})

export default defineEventHandler(async (event) => {
  if (!isAuthorizedSyncRequest(event, getHeader(event, 'x-office-sync-secret'))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const body = Body.parse(await readBody(event))

  const anchor = await queryOne<{ x: number; y: number; office_id: string }>(
    `SELECT (position->>'x')::int AS x,
            (position->>'y')::int AS y,
            office_id
       FROM office_zones WHERE id = $1`,
    [body.anchorZoneId],
  )
  if (!anchor || anchor.office_id !== body.officeId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid anchor zone' })
  }

  const slug = `adhoc-${body.anchorZoneId.slice(0, 8)}-${Date.now()}`
  const position = { x: anchor.x, y: anchor.y - 80, w: 120, h: 80 }

  const adhoc = await queryOne<OfficeZoneRow>(
    `INSERT INTO office_zones
       (office_id, slug, name, zone_type, capacity, position,
        is_ephemeral, anchor_zone_id)
     VALUES ($1, $2, '', 'adhoc', $3, $4::jsonb, TRUE, $5)
     RETURNING *`,
    [body.officeId, slug, body.capacity, JSON.stringify(position), body.anchorZoneId],
  )
  if (!adhoc) throw createError({ statusCode: 500, statusMessage: 'Insert failed' })
  return { zone: adhoc }
})
