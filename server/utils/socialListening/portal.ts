// server/utils/socialListening/portal.ts
// Client-portal listening data layer (Slice 4d). Tenant isolation is the cardinal rule: every query
// is scoped to the session clientId the endpoint passes (from requireClientAuth — NEVER caller
// input). Reuses the agency analytics shape so analytics.ts applies unchanged.
import type { MentionRow } from '~~/server/utils/socialListening/analytics'

export interface PortalListeningDb { queryRows<T = any>(sql: string, params?: any[]): Promise<T[]> }

export async function portalListMentions(
  db: PortalListeningDb, clientId: string, opts: { limit?: number; source?: string; sentiment?: string },
): Promise<any[]> {
  const where: string[] = ['client_id = $1']
  const params: any[] = [clientId]
  const add = (frag: string, val: any) => { params.push(val); where.push(frag.replace('$?', `$${params.length}`)) }
  if (opts.source) add('source = $?', opts.source)
  if (opts.sentiment) add('sentiment = $?', opts.sentiment)
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200)
  params.push(limit)
  return db.queryRows(
    `SELECT id, source, url, author, title, content, sentiment, topics, published_at
       FROM social_listening_mentions WHERE ${where.join(' AND ')}
       ORDER BY published_at DESC NULLS LAST LIMIT $${params.length}`, params)
}

export async function portalOverviewRows(db: PortalListeningDb, clientId: string, days: number): Promise<MentionRow[]> {
  const d = Math.min(Math.max(days || 30, 1), 365)
  return db.queryRows<MentionRow>(
    `SELECT m.source, m.sentiment, m.topics, m.published_at, q.category
       FROM social_listening_mentions m
       LEFT JOIN social_listening_queries q ON q.id = m.query_id
      WHERE m.client_id = $1
        AND COALESCE(m.published_at, m.created_at) > NOW() - MAKE_INTERVAL(days => $2)`,
    [clientId, d])
}
