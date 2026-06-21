/**
 * Publish an agent-proposed KB draft (command-center spec §3/§4).
 * PATCH /api/agency/ai/knowledge/:id/publish
 *
 * The human review gate: flips a draft to published + approved, stamps the reviewer, then embeds it so
 * search_knowledge can find it (the fail-closed read only returns is_published=true rows). MANAGEMENT-gated.
 * Idempotent-ish: only a row currently in review_status='draft' is published (re-publishing is a no-op 404).
 */
import { requirePermission } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { embedKnowledgeArticle } from '~~/server/utils/aiEmbeddingPipeline'

export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'MANAGEMENT')
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id is required' })

  const row = await queryOne<{ id: string }>(
    `UPDATE ai_knowledge_articles
        SET is_published = true, review_status = 'approved', reviewed_by = $2, reviewed_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND review_status = 'draft'
      RETURNING id`,
    [id, user.id],
  )
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Draft not found or already reviewed' })

  // Embed for search (fire-and-forget — the publish succeeds regardless; batchEmbed backfills any miss).
  embedKnowledgeArticle(event, id).catch(err => console.error('[knowledge] publish embed failed:', id, err))

  return { ok: true, id, published: true }
})
