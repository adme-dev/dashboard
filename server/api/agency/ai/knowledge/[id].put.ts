import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { embedKnowledgeArticle } from '~~/server/utils/aiEmbeddingPipeline'

export default defineEventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner', 'project_manager'])
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article ID is required' })
  }

  const body = await readBody(event)

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Title is required' })
  }
  if (!body.content?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Content is required' })
  }

  const validCategories = ['sop', 'process', 'faq', 'client_preference', 'best_practice']
  const category = validCategories.includes(body.category) ? body.category : null

  const tags: string[] = Array.isArray(body.tags)
    ? body.tags.filter((t: any) => typeof t === 'string' && t.trim()).map((t: string) => t.trim().toLowerCase())
    : typeof body.tags === 'string'
      ? body.tags.split(',').map((t: string) => t.trim().toLowerCase()).filter(Boolean)
      : []

  const isPublished = body.isPublished !== undefined ? body.isPublished : true

  // Publishing via PUT (the manual editor) must also clear any 'draft' review state, so an
  // agent-proposed draft can never end up searchable while still labelled 'draft' in the review queue.
  const row = await queryOne<any>(`
    UPDATE ai_knowledge_articles
    SET title = $2, content = $3, category = $4, tags = $5, is_published = $6, updated_at = NOW(),
        review_status = CASE WHEN $6 = true AND review_status = 'draft' THEN 'approved' ELSE review_status END
    WHERE id = $1
    RETURNING *
  `, [id, body.title.trim(), body.content.trim(), category, tags, isPublished])

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  }

  // Re-embed in background
  embedKnowledgeArticle(row.id).catch(err => {
    console.error('[knowledge] Re-embedding failed for article:', row.id, err)
  })

  return {
    id: row.id,
    title: row.title,
    content: row.content,
    category: row.category,
    tags: row.tags || [],
    embeddingId: row.embedding_id,
    source: row.source,
    authorId: row.author_id,
    isPublished: row.is_published,
    viewCount: row.view_count,
    usefulnessScore: Number(row.usefulness_score),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
})
