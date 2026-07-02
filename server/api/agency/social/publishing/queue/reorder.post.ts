import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { transaction } from '~~/server/utils/db'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * POST /api/agency/social/publishing/queue/reorder
 * Body: { clientId, orderedIds: string[] } — set queue_position to the array index.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, b.clientId)
  const orderedIds: string[] = Array.isArray(b.orderedIds) ? b.orderedIds : []
  if (!orderedIds.length) throw createError({ statusCode: 400, statusMessage: 'orderedIds required' })

  // transaction() callback uses client.query() directly (never the queryOne/execute helpers).
  await transaction(async (client) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query(
        `UPDATE social_posts SET queue_position = $1, updated_at = NOW()
          WHERE id = $2 AND client_id = $3`,
        [i, orderedIds[i], b.clientId],
      )
    }
  })

  return { ok: true, count: orderedIds.length }
})
