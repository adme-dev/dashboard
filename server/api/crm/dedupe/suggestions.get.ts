// server/api/crm/dedupe/suggestions.get.ts
// Suggest likely-duplicate contacts for a client (in-app blocked scan over the
// client's bounded contact set; pg_trgm indexes back a future scale-up).
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { candidatePairs, type DedupeRecord } from '~~/server/utils/crm/dedupe'

const Query = z.object({
  client_id: z.string().uuid(),
  entity_type: z.enum(['person', 'company']).default('person'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = Query.parse(getQuery(event))

  const rows = q.entity_type === 'person'
    ? await queryRows<any>(
        `SELECT id, first_name, last_name, email, phone, mobile FROM crm_people
          WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5000`, [q.client_id])
    : await queryRows<any>(
        `SELECT id, name, domain, phone FROM crm_companies
          WHERE client_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 5000`, [q.client_id])

  const records: DedupeRecord[] = rows.map(r => q.entity_type === 'person'
    ? { id: r.id, email: r.email, phone: r.phone || r.mobile, name: [r.first_name, r.last_name].filter(Boolean).join(' ') }
    // For companies the domain is the strong exact-match key (no email column).
    : { id: r.id, email: r.domain, phone: r.phone, name: r.name })

  const byId = new Map(rows.map(r => [r.id, r]))
  const display = (r: any) => q.entity_type === 'person'
    ? { id: r.id, name: [r.first_name, r.last_name].filter(Boolean).join(' ') || '(no name)', email: r.email, phone: r.phone || r.mobile }
    : { id: r.id, name: r.name, email: r.domain, phone: r.phone }

  const items = candidatePairs(records).slice(0, q.limit).map(p => ({
    score: Math.round(p.score * 100) / 100,
    a: display(byId.get(p.a_id)),
    b: display(byId.get(p.b_id)),
  }))
  return { items }
})
