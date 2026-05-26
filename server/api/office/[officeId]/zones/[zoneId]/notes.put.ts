/**
 * PUT /api/office/:officeId/zones/:zoneId/notes
 * Member-scoped room notes update with optimistic version checking.
 */

import { z } from 'zod'
import type { ActorHandle, OfficeMemberRow, OfficeZoneRow } from '~~/app/types/office'
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { evaluateAcl } from '~~/server/utils/officeRoom'
import { ensureOfficeZoneThreadChannel } from '~~/server/utils/officeThreads'

const Body = z.object({
  notes: z.string().max(20_000),
  version: z.number().int().min(0)
})

function roomNotesThreadContent(zone: Pick<OfficeZoneRow, 'name'>, notes: string) {
  const snippet = notes.trim().slice(0, 1200)
  return [
    `Updated room notes: ${zone.name}`,
    snippet
  ].filter(Boolean).join('\n\n')
}

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  const zoneId = getRouterParam(event, 'zoneId')!
  const user = await requireAuth(event)
  const body = Body.parse(await readBody(event))

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Office membership required' })
  }

  const zone = await queryOne<OfficeZoneRow>(
    `SELECT * FROM office_zones WHERE id = $1 AND office_id = $2`,
    [zoneId, officeId]
  )
  if (!zone) {
    throw createError({ statusCode: 404, statusMessage: 'Office zone not found' })
  }

  const actor = {
    type: 'user' as const,
    id: user.id,
    handle: `user:${user.id}` as ActorHandle
  }
  const acl = evaluateAcl({ actor, zone, membership })
  if (!acl.allowed) {
    throw createError({ statusCode: 403, statusMessage: acl.reason })
  }

  const updated = await queryOne<OfficeZoneRow>(
    `UPDATE office_zones
        SET notes = $1,
            notes_version = notes_version + 1,
            notes_updated_at = now(),
            notes_updated_by = $2
      WHERE id = $3
        AND office_id = $4
        AND notes_version = $5
      RETURNING *`,
    [body.notes, user.id, zoneId, officeId, body.version]
  )

  if (!updated) {
    const current = await queryOne<Pick<OfficeZoneRow, 'notes' | 'notes_version' | 'notes_updated_at' | 'notes_updated_by'>>(
      `SELECT notes, notes_version, notes_updated_at, notes_updated_by
         FROM office_zones
        WHERE id = $1 AND office_id = $2`,
      [zoneId, officeId]
    )
    throw createError({
      statusCode: 409,
      statusMessage: 'Room notes changed. Refresh before saving.',
      data: current
    })
  }

  const channel = await ensureOfficeZoneThreadChannel({
    officeId,
    zoneId,
    actorId: user.id
  })
  if (channel) {
    await queryOne(
      `INSERT INTO chat_messages (channel_id, user_id, content, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        channel.id,
        user.id,
        roomNotesThreadContent(updated, updated.notes),
        JSON.stringify({
          source: 'office_room_notes',
          office_id: officeId,
          zone_id: zoneId,
          notes_version: updated.notes_version
        })
      ]
    )
  }

  return { zone: updated }
})
