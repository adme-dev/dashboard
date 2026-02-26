import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

/**
 * Lightweight entity search for AI chat @mention autocomplete.
 * Searches tasks, clients, projects, briefs in parallel and returns
 * a unified list sorted by relevance.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  const type = query.type as string | undefined
  const limit = Math.min(Math.max(parseInt(query.limit as string) || 8, 1), 20)

  if (!q || q.length < 2) {
    return { results: [] }
  }

  const searchTerm = `%${q}%`
  const searches: Promise<any[]>[] = []
  const types = type ? [type] : ['task', 'client', 'project', 'brief']

  if (types.includes('task')) {
    searches.push(
      queryRows(`
        SELECT t.id, t.title, t.status,
               p.name as project_name,
               'task' as entity_type
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.title ILIKE $1
        ORDER BY t.updated_at DESC NULLS LAST
        LIMIT $2
      `, [searchTerm, limit])
    )
  }

  if (types.includes('client')) {
    searches.push(
      queryRows(`
        SELECT id, name as title,
               CASE WHEN is_active THEN 'active' ELSE 'inactive' END as status,
               billing_type as extra,
               'client' as entity_type
        FROM agency_clients
        WHERE name ILIKE $1
        ORDER BY updated_at DESC NULLS LAST
        LIMIT $2
      `, [searchTerm, limit])
    )
  }

  if (types.includes('project')) {
    searches.push(
      queryRows(`
        SELECT p.id, p.name as title, p.status,
               ac.name as client_name,
               'project' as entity_type
        FROM projects p
        LEFT JOIN agency_clients ac ON ac.id = p.client_id
        WHERE p.name ILIKE $1
        ORDER BY p.updated_at DESC NULLS LAST
        LIMIT $2
      `, [searchTerm, limit])
    )
  }

  if (types.includes('brief')) {
    searches.push(
      queryRows(`
        SELECT br.id, br.title, br.status,
               ac.name as client_name,
               'brief' as entity_type
        FROM briefs br
        LEFT JOIN agency_clients ac ON ac.id = br.client_id
        WHERE br.title ILIKE $1
        ORDER BY br.updated_at DESC NULLS LAST
        LIMIT $2
      `, [searchTerm, limit])
    )
  }

  const allResults = await Promise.all(searches)

  const results = allResults.flat().map(row => ({
    id: row.id,
    type: row.entity_type,
    title: row.title,
    subtitle: row.entity_type === 'task' ? row.project_name
            : row.entity_type === 'brief' ? row.client_name
            : row.entity_type === 'project' ? row.client_name
            : row.entity_type === 'client' ? row.status
            : row.extra || null,
    status: row.status || null,
  }))

  // Sort: exact prefix matches first, then alphabetical
  const lowerQ = q.toLowerCase()
  results.sort((a, b) => {
    const aPrefix = a.title.toLowerCase().startsWith(lowerQ) ? 0 : 1
    const bPrefix = b.title.toLowerCase().startsWith(lowerQ) ? 0 : 1
    if (aPrefix !== bPrefix) return aPrefix - bPrefix
    return a.title.localeCompare(b.title)
  })

  return { results: results.slice(0, limit) }
})
