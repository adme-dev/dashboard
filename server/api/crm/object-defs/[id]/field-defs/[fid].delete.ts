// server/api/crm/object-defs/[id]/field-defs/[fid].delete.ts — delete a field (agency-only).
import { z } from 'zod'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { execute } from '~~/server/utils/db'

const Query = z.object({ client_id: z.string().uuid() })

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, PERMISSIONS.ADMIN)
  const fid = getRouterParam(event, 'fid')
  const { client_id } = Query.parse(getQuery(event))
  const n = await execute(`DELETE FROM crm_field_defs WHERE id = $1 AND client_id = $2`, [fid, client_id])
  if (!n) throw createError({ statusCode: 404, statusMessage: 'Field not found' })
  return { ok: true }
})
