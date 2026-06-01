// server/api/client-portal/crm/search.get.ts
// F8 — portal mirror. Scoped to the authenticated client's session (never trusts
// a request-supplied client_id).
import { z } from 'zod'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { queryRows } from '~~/server/utils/db'
import { buildSearchQuery, type CrmSearchHit } from '~~/server/utils/crm/search'

const Query = z.object({
  q: z.string().optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export default defineEventHandler(async (event): Promise<{ results: CrmSearchHit[] }> => {
  const client = await requireClientAuth(event)
  const q = Query.parse(getQuery(event))
  const built = buildSearchQuery(client.clientId, q.q, q.limit ?? 20)
  if (!built) return { results: [] }
  const rows = await queryRows<{ type: string, id: string, title: string, subtitle: string | null, rank: string }>(
    built.sql,
    built.params,
  )
  const results = rows.map(r => ({
    type: r.type as CrmSearchHit['type'],
    id: r.id,
    title: r.title || '(untitled)',
    subtitle: r.subtitle,
    rank: Number(r.rank),
  }))
  return { results }
})
