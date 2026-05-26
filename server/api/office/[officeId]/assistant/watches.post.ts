/**
 * POST /api/office/:officeId/assistant/watches
 * Create an office-aware assistant watch.
 */
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { ensureOfficeAssistantTables } from '~~/server/utils/officeAssistant'
import type { OfficeAssistantWatchRow, OfficeMemberRow } from '~~/app/types/office'

const Body = z.object({
  watch_type: z.enum(['person_available', 'room_occupied', 'co_presence', 'meeting_ended', 'lobby_guest_waiting']),
  label: z.string().trim().min(1).max(180),
  conditions: z.record(z.string(), z.unknown()).default({}),
  delivery: z.object({
    notification: z.boolean().optional(),
    chat: z.boolean().optional(),
    email: z.boolean().optional()
  }).default({ notification: true })
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const officeId = getRouterParam(event, 'officeId')
  if (!officeId) {
    throw createError({ statusCode: 400, statusMessage: 'officeId required' })
  }

  const membership = await queryOne<OfficeMemberRow>(
    `SELECT * FROM office_members WHERE office_id = $1 AND user_id = $2`,
    [officeId, user.id]
  )
  if (!membership) {
    throw createError({ statusCode: 403, statusMessage: 'Not a member of this office' })
  }

  await ensureOfficeAssistantTables()
  const body = Body.parse(await readBody(event))
  const watch = await queryOne<OfficeAssistantWatchRow>(
    `INSERT INTO office_assistant_watches (
       office_id, user_id, watch_type, label, conditions, delivery
     )
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      officeId,
      user.id,
      body.watch_type,
      body.label,
      JSON.stringify(body.conditions),
      JSON.stringify(body.delivery)
    ]
  )

  if (!watch) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create assistant watch' })
  }

  return { watch }
})
