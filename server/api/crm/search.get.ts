// server/api/crm/search.get.ts
// F8 — agency-side global CRM search. Client-scoped via explicit client_id.
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildSearchQuery, type CrmSearchHit } from '~~/server/utils/crm/search'

const Query = z.object({
  client_id: z.string().uuid(),
  q: z.string().optional().default(''),
  limit: z.coerce.number().int().min(1).max(50).optional(),
})

export default defineEventHandler(async (event): Promise<{ results: CrmSearchHit[] }> => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))
  const built = buildSearchQuery(q.client_id, q.q, q.limit ?? 20)
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
