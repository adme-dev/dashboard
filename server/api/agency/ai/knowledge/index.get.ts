import { queryRows, queryCount } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const category = query.category as string | undefined
  const search = query.search as string | undefined
  const published = query.published !== 'false'
  const limit = Math.min(parseInt(query.limit as string) || 20, 100)
  const offset = parseInt(query.offset as string) || 0

  const conditions: string[] = []
  const params: any[] = []
  let paramIndex = 1

  if (published) {
    conditions.push(`a.is_published = true`)
  }

  if (category) {
    conditions.push(`a.category = $${paramIndex}`)
    params.push(category)
    paramIndex++
  }

  if (search) {
    conditions.push(`(a.title ILIKE $${paramIndex} OR a.content ILIKE $${paramIndex} OR $${paramIndex + 1} = ANY(a.tags))`)
    params.push(`%${search}%`, search.toLowerCase())
    paramIndex += 2
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const [articles, total] = await Promise.all([
    queryRows(`
      SELECT a.id, a.title, a.content, a.category, a.tags, a.source,
             a.author_id, a.is_published, a.view_count, a.usefulness_score,
             a.created_at, a.updated_at,
             tm.name as author_name
      FROM ai_knowledge_articles a
      LEFT JOIN team_members tm ON tm.id = a.author_id
      ${whereClause}
      ORDER BY a.updated_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...params, limit, offset]),
    queryCount(`
      SELECT COUNT(*) as count
      FROM ai_knowledge_articles a
      ${whereClause}
    `, params),
  ])

  return {
    articles: articles.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      category: a.category,
      tags: a.tags || [],
      embeddingId: a.embedding_id,
      source: a.source,
      authorId: a.author_id,
      authorName: a.author_name,
      isPublished: a.is_published,
      viewCount: a.view_count,
      usefulnessScore: Number(a.usefulness_score),
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
    total,
    limit,
    offset,
  }
})
