import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Article ID is required' })
  }

  const article = await queryOne<any>(`
    SELECT a.id, a.title, a.content, a.category, a.tags, a.embedding_id,
           a.source, a.author_id, a.is_published, a.view_count, a.usefulness_score,
           a.created_at, a.updated_at,
           tm.name as author_name
    FROM ai_knowledge_articles a
    LEFT JOIN team_members tm ON tm.id = a.author_id
    WHERE a.id = $1
  `, [id])

  if (!article) {
    throw createError({ statusCode: 404, statusMessage: 'Article not found' })
  }

  // Increment view count (fire-and-forget)
  execute(`
    UPDATE ai_knowledge_articles SET view_count = view_count + 1 WHERE id = $1
  `, [id]).catch(() => {})

  return {
    id: article.id,
    title: article.title,
    content: article.content,
    category: article.category,
    tags: article.tags || [],
    embeddingId: article.embedding_id,
    source: article.source,
    authorId: article.author_id,
    authorName: article.author_name,
    isPublished: article.is_published,
    viewCount: article.view_count + 1,
    usefulnessScore: Number(article.usefulness_score),
    createdAt: article.created_at,
    updatedAt: article.updated_at,
  }
})
