// server/api/crm/verticals/assign.post.ts
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Body = z.object({ client_id: z.string().uuid(), vertical_key: z.string().min(1), enabled: z.boolean() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.MANAGEMENT)
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: parsed.error.message })
  const b = parsed.data
  if (b.enabled) {
    await execute(
      `INSERT INTO crm_client_verticals (client_id, vertical_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [b.client_id, b.vertical_key],
    )
  } else {
    await execute(`DELETE FROM crm_client_verticals WHERE client_id = $1 AND vertical_key = $2`, [b.client_id, b.vertical_key])
  }
  return { ok: true }
})
