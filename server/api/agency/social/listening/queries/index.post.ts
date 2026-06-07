import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

const CATEGORIES = new Set(['brand', 'competitor', 'product', 'campaign'])
const SOURCES = new Set(['reddit', 'news', 'youtube', 'bluesky', 'mastodon', 'hackernews', 'lemmy'])
const cleanArr = (v: any, allow?: Set<string>): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x: any) => String(x).trim()).filter((x: string) => x && (!allow || allow.has(x))))] : []

/** POST /api/agency/social/listening/queries — create a listening query. */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  if (!b?.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'name required' })
  const include = cleanArr(b.includeTerms)
  if (!include.length) throw createError({ statusCode: 400, statusMessage: 'at least one include term required' })
  const exclude = cleanArr(b.excludeTerms)
  const sources = cleanArr(b.sources, SOURCES)
  const category = b.category && CATEGORIES.has(b.category) ? b.category : null
  return queryOne(
    `INSERT INTO social_listening_queries (client_id, name, include_terms, exclude_terms, sources, category, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [b.clientId, String(b.name).trim(), include, exclude, sources, category, b.enabled !== false, String(user.id)])
})
