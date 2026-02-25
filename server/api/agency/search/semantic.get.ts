/**
 * GET /api/agency/search/semantic
 * Hybrid semantic + keyword search across tasks, briefs, and clients.
 * Query params: q (required), type (optional: task|brief|client), limit (default 10)
 */
import { searchSimilar } from '~~/server/utils/aiVectorize'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'Query parameter q is required' })
  }

  const typeFilter = query.type as string | undefined
  const limit = Math.min(Number(query.limit) || 10, 50)

  // Run semantic search and keyword search in parallel
  const [semanticResults, keywordResults] = await Promise.all([
    searchSimilar(event, q, limit).catch(() => [] as any[]),
    keywordSearch(q, typeFilter, limit),
  ])

  // Merge and deduplicate
  const resultMap = new Map<string, { type: string; id: string; title: string; score: number; metadata: Record<string, string> }>()

  for (const match of semanticResults) {
    const key = `${match.metadata?.type}:${match.metadata?.id}`
    if (typeFilter && match.metadata?.type !== typeFilter) continue
    resultMap.set(key, {
      type: match.metadata?.type || 'unknown',
      id: match.metadata?.id || match.id,
      title: match.metadata?.title || '',
      score: match.score,
      metadata: match.metadata || {},
    })
  }

  for (const item of keywordResults) {
    const key = `${item.type}:${item.id}`
    if (resultMap.has(key)) {
      // Boost score for items found by both methods
      const existing = resultMap.get(key)!
      existing.score = Math.min(1, existing.score + 0.2)
    } else {
      resultMap.set(key, {
        type: item.type,
        id: item.id,
        title: item.title,
        score: item.score,
        metadata: { type: item.type, id: item.id, title: item.title },
      })
    }
  }

  // Sort by score descending, limit results
  const results = Array.from(resultMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return { results }
})

async function keywordSearch(
  q: string,
  typeFilter: string | undefined,
  limit: number
): Promise<Array<{ type: string; id: string; title: string; score: number }>> {
  const results: Array<{ type: string; id: string; title: string; score: number }> = []
  const searchTerm = `%${q}%`

  if (!typeFilter || typeFilter === 'task') {
    const tasks = await queryRows<any>(`
      SELECT id, name as title FROM tasks
      WHERE (name ILIKE $1 OR description ILIKE $1)
        AND parent_task_id IS NULL
      LIMIT $2
    `, [searchTerm, limit])
    for (const t of tasks) {
      results.push({ type: 'task', id: t.id, title: t.title, score: 0.5 })
    }
  }

  if (!typeFilter || typeFilter === 'brief') {
    const briefs = await queryRows<any>(`
      SELECT id, title FROM briefs
      WHERE (title ILIKE $1 OR description ILIKE $1)
      LIMIT $2
    `, [searchTerm, limit])
    for (const b of briefs) {
      results.push({ type: 'brief', id: b.id, title: b.title, score: 0.5 })
    }
  }

  if (!typeFilter || typeFilter === 'client') {
    const clients = await queryRows<any>(`
      SELECT id, name as title FROM agency_clients
      WHERE (name ILIKE $1 OR notes ILIKE $1)
      LIMIT $2
    `, [searchTerm, limit])
    for (const c of clients) {
      results.push({ type: 'client', id: c.id, title: c.title, score: 0.5 })
    }
  }

  return results
}
