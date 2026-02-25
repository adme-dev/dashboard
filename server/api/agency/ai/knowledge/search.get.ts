import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { searchSimilar } from '~~/server/utils/aiVectorize'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)

  const q = (query.q as string || '').trim()
  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'Search query (q) is required' })
  }

  const limit = Math.min(parseInt(query.limit as string) || 10, 50)

  // Run text search and semantic search in parallel
  const [textResults, semanticResults] = await Promise.all([
    // Full-text search via ILIKE
    queryRows<any>(`
      SELECT id, title, content, category, tags, view_count, usefulness_score,
             created_at, updated_at
      FROM ai_knowledge_articles
      WHERE is_published = true
        AND (title ILIKE $1 OR content ILIKE $1)
      ORDER BY
        CASE WHEN title ILIKE $1 THEN 0 ELSE 1 END,
        usefulness_score DESC,
        view_count DESC
      LIMIT $2
    `, [`%${q}%`, limit]),

    // Semantic search via Vectorize (returns empty if binding unavailable)
    searchSimilar(q, limit).catch(() => []),
  ])

  // Build a map of text results by ID
  const resultMap = new Map<string, any>()

  for (const row of textResults) {
    resultMap.set(row.id, {
      id: row.id,
      title: row.title,
      content: row.content.length > 300 ? row.content.slice(0, 300) + '...' : row.content,
      category: row.category,
      tags: row.tags || [],
      viewCount: row.view_count,
      usefulnessScore: Number(row.usefulness_score),
      relevanceScore: 0.8, // Text match base score
      source: 'text' as const,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })
  }

  // Merge semantic results
  const semanticArticleIds: string[] = []
  const semanticScores = new Map<string, number>()

  for (const match of semanticResults) {
    if (match.metadata?.type === 'knowledge_article' && match.metadata?.id) {
      semanticArticleIds.push(match.metadata.id)
      semanticScores.set(match.metadata.id, match.score)

      // If already in text results, boost the score
      const existing = resultMap.get(match.metadata.id)
      if (existing) {
        existing.relevanceScore = Math.min(1.0, existing.relevanceScore + match.score * 0.3)
        existing.source = 'both'
      }
    }
  }

  // Fetch semantic-only results not already in text results
  const missingIds = semanticArticleIds.filter(id => !resultMap.has(id))
  if (missingIds.length > 0) {
    const placeholders = missingIds.map((_, i) => `$${i + 1}`).join(', ')
    const semanticRows = await queryRows<any>(`
      SELECT id, title, content, category, tags, view_count, usefulness_score,
             created_at, updated_at
      FROM ai_knowledge_articles
      WHERE id IN (${placeholders}) AND is_published = true
    `, missingIds)

    for (const row of semanticRows) {
      resultMap.set(row.id, {
        id: row.id,
        title: row.title,
        content: row.content.length > 300 ? row.content.slice(0, 300) + '...' : row.content,
        category: row.category,
        tags: row.tags || [],
        viewCount: row.view_count,
        usefulnessScore: Number(row.usefulness_score),
        relevanceScore: semanticScores.get(row.id) || 0.5,
        source: 'semantic' as const,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
    }
  }

  // Sort by relevance and return
  const results = Array.from(resultMap.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)

  return { results, total: results.length }
})
