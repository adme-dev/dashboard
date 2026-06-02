import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const CATEGORIES = new Set(['brand', 'competitor', 'product', 'campaign'])
const SOURCES = new Set(['reddit', 'news', 'youtube', 'bluesky', 'mastodon'])
const cleanArr = (v: any, allow?: Set<string>): string[] =>
  Array.isArray(v) ? [...new Set(v.map((x: any) => String(x).trim()).filter((x: string) => x && (!allow || allow.has(x))))] : []

/** PATCH /api/agency/social/listening/queries/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (frag: string, val: any) => { params.push(val); sets.push(frag.replace('$?', `$${params.length}`)) }

  if (b.name?.trim()) set('name = $?', String(b.name).trim())
  if (b.includeTerms !== undefined) set('include_terms = $?', cleanArr(b.includeTerms))
  if (b.excludeTerms !== undefined) set('exclude_terms = $?', cleanArr(b.excludeTerms))
  if (b.sources !== undefined) set('sources = $?', cleanArr(b.sources, SOURCES))
  if (b.category !== undefined) set('category = $?', b.category && CATEGORIES.has(b.category) ? b.category : null)
  if (b.enabled !== undefined) set('enabled = $?', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })

  params.push(id)
  await execute(`UPDATE social_listening_queries SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length}`, params)
  return { ok: true }
})
