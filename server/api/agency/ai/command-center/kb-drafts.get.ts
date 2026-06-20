/**
 * AI Command Center — KB drafts review queue (command-center spec §4 Knowledge).
 * GET /api/agency/ai/command-center/kb-drafts
 *
 * Agent-proposed knowledge articles awaiting human review (review_status='draft', is_published=false).
 * MANAGEMENT-gated. Read-only — publishing/rejecting are the separate publish/reject endpoints.
 */
import { requireAuth } from '~~/server/utils/auth'
import { roleHasPermission } from '~~/server/utils/permissions'
import { queryRows } from '~~/server/utils/db'
import { mapDraft, type DraftRow } from '~~/server/utils/ai/commandCenter'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (!roleHasPermission(user.role, 'MANAGEMENT')) {
    throw createError({ statusCode: 403, statusMessage: 'Reviewing KB drafts requires a management role' })
  }

  const rows = await queryRows<DraftRow>(
    `SELECT a.id, a.title, a.content, a.category, a.author_id, a.created_at,
            tm.name AS author_name
       FROM ai_knowledge_articles a
       LEFT JOIN team_members tm ON tm.id = a.author_id
      WHERE a.review_status = 'draft' AND a.is_published = false
      ORDER BY a.created_at DESC
      LIMIT 100`,
  )

  return { drafts: rows.map(mapDraft), count: rows.length }
})
