import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const rows = await queryRows<any>(`
    SELECT entity_type as type,
           COUNT(*)::int as count,
           MAX(created_at) as last_embedded
    FROM ai_embeddings_log
    WHERE entity_type LIKE 'fin-%'
    GROUP BY entity_type
    ORDER BY entity_type
  `)

  const totalVectors = rows.reduce((s, r) => s + r.count, 0)

  return {
    types: rows,
    totalVectors,
  }
})
