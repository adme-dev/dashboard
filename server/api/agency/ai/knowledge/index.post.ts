import { queryOne } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { embedKnowledgeArticle } from '~~/server/utils/aiEmbeddingPipeline'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner', 'project_manager'])
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

  const row = await queryOne<any>(`
    INSERT INTO ai_knowledge_articles (title, content, category, tags, source, author_id)
    VALUES ($1, $2, $3, $4, 'manual', $5)
    RETURNING *
  `, [body.title.trim(), body.content.trim(), category, tags, user.id])

  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to create article' })
  }

  // Trigger embedding in background (fire-and-forget)
  embedKnowledgeArticle(row.id).catch(err => {
    console.error('[knowledge] Embedding failed for article:', row.id, err)
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
