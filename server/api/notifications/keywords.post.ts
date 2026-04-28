/**
 * Add a keyword subscription. Idempotent (case-insensitive unique per user).
 */
import { queryOne } from '~~/server/utils/db'

interface Body {
  keyword: string
}

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody<Body>(event)

  const keyword = (body?.keyword || '').trim()
  if (!keyword) {
    throw createError({ statusCode: 400, statusMessage: 'keyword is required' })
  }
  if (keyword.length < 2 || keyword.length > 80) {
    throw createError({ statusCode: 400, statusMessage: 'keyword must be 2..80 chars' })
  }

  const row = await queryOne(`
    INSERT INTO keyword_subscriptions (user_id, keyword)
    VALUES ($1, $2)
    ON CONFLICT (user_id, LOWER(keyword)) DO NOTHING
    RETURNING id, keyword, created_at
  `, [user.id, keyword])

  if (!row) {
    // Already exists — fetch
    const existing = await queryOne(
      `SELECT id, keyword, created_at FROM keyword_subscriptions WHERE user_id = $1 AND LOWER(keyword) = LOWER($2)`,
      [user.id, keyword]
    )
    return { id: existing?.id, keyword: existing?.keyword, createdAt: existing?.created_at, alreadyExisted: true }
  }

  return { id: row.id, keyword: row.keyword, createdAt: row.created_at, alreadyExisted: false }
})
