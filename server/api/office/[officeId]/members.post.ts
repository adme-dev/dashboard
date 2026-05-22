/**
 * POST /api/office/:officeId/members
 * Admin-only: add a staff or client member to the office.
 * Exactly one of user_id / client_user_id must be supplied.
 */

import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireOfficeAdmin } from '~~/server/utils/officeRoom'

const Body = z
  .object({
    user_id: z.string().uuid().optional(),
    client_user_id: z.string().uuid().optional(),
    role: z.enum(['admin', 'member', 'guest']),
  })
  .refine((b) => Boolean(b.user_id) !== Boolean(b.client_user_id), {
    message: 'Provide exactly one of user_id or client_user_id',
  })

export default defineEventHandler(async (event) => {
  const officeId = getRouterParam(event, 'officeId')!
  await requireOfficeAdmin(event, officeId)
  const body = Body.parse(await readBody(event))

  const row = await queryOne<{ id: string }>(
    `INSERT INTO office_members (office_id, user_id, client_user_id, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [officeId, body.user_id ?? null, body.client_user_id ?? null, body.role],
  )
  return { id: row?.id ?? null }
})
