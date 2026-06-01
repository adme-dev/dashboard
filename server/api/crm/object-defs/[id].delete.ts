// server/api/crm/object-defs/[id].delete.ts — soft-delete a config object (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const id = getRouterParam(event, 'id')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(
    `UPDATE crm_object_defs SET deleted_at = NOW() WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [id, client_id],
  )
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Object not found' })
  return { ok: true }
})
