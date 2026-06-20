/**
 * Reject an agent-proposed KB draft (command-center spec §4).
 * PATCH /api/agency/ai/knowledge/:id/reject
 *
 * Marks a draft rejected (stays is_published=false, so never searchable). MANAGEMENT-gated.
 */
import { requireAuth } from '~~/server/utils/auth'
import { roleHasPermission } from '~~/server/utils/permissions'
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (!roleHasPermission(user.role, 'MANAGEMENT')) {
    throw createError({ statusCode: 403, statusMessage: 'Reviewing knowledge requires a management role' })
  }
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const row = await queryOne<{ id: string }>(
    `UPDATE ai_knowledge_articles
        SET review_status = 'rejected', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND review_status = 'draft'
      RETURNING id`,
    [id, user.id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Draft not found or already reviewed' })

  return { ok: true, id, rejected: true }
})
