import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** PATCH /api/agency/social/inbox/saved-replies/:id  body: partial; or { incrementUsage: true } */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  if (b.incrementUsage === true) {
    return await queryOne(`UPDATE social_saved_replies SET usage_count = usage_count + 1, updated_at = NOW() WHERE id = $1 RETURNING *`, [id])
  }
  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any) => { params.push(val); sets.push(`${col} = $${params.length}`) }
  if (b.name != null) set('name', String(b.name).trim())
  if (b.content != null) set('content', String(b.content).trim())
  if (b.category !== undefined) set('category', b.category || null)
  if (b.platforms !== undefined) set('platforms', Array.isArray(b.platforms) && b.platforms.length ? b.platforms : null)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'nothing to update' })
  params.push(id)
  return await queryOne(`UPDATE social_saved_replies SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
})
