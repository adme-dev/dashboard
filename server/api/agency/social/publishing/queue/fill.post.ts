import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { queryOne, queryRows, transaction } from '~~/server/utils/db'
import { nextQueuePositions } from '~~/server/utils/socialPublishingQueue'
import { requireSocialClientAccess } from '~~/server/utils/social/clientAccess'

/**
 * POST /api/agency/social/publishing/queue/fill
 * Body: { clientId, postIds? } — append a client's unqueued drafts to the queue.
 * Assigns queue_position after the current max, in created_at order. When postIds
 * is given, only those drafts are added; otherwise all eligible drafts.
 */
export default defineEventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  await requireSocialClientAccess(event, b.clientId)
  const postIds: string[] | undefined = Array.isArray(b.postIds) ? b.postIds : undefined

  const maxRow = await queryOne<{ max: number | null }>(
    `SELECT MAX(queue_position) AS max FROM social_posts
      WHERE client_id = $1 AND queue_position IS NOT NULL`,
    [b.clientId],
  )

  const params: any[] = [b.clientId]
  let sql = `SELECT id FROM social_posts
              WHERE client_id = $1 AND status = 'draft' AND queue_position IS NULL`
  if (postIds && postIds.length) {
    params.push(postIds)
    sql += ` AND id = ANY($${params.length}::uuid[])`
  }
  sql += ` ORDER BY created_at ASC`
  const drafts = await queryRows<{ id: string }>(sql, params)

  const assignments = nextQueuePositions(maxRow?.max ?? null, drafts.map(d => d.id))
  if (assignments.length) {
    await transaction(async (client) => {
      for (const a of assignments) {
        await client.query(
          `UPDATE social_posts SET queue_position = $1, updated_at = NOW()
            WHERE id = $2 AND client_id = $3`,
          [a.position, a.id, b.clientId],
        )
      }
    })
  }

  return { count: assignments.length }
})
