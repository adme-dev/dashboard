import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/saved-replies  body { name, content, category?, client_id?, platforms? } */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.name?.trim() || !b?.content?.trim()) throw createError({ statusCode: 400, statusMessage: 'name and content required' })
  return await queryOne(
    `INSERT INTO social_saved_replies (client_id, name, category, content, platforms, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [b.client_id || null, b.name.trim(), b.category || null, b.content.trim(),
     Array.isArray(b.platforms) && b.platforms.length ? b.platforms : null, String(user.id)])
})
