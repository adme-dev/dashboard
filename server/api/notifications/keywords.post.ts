/**
 * Add a keyword subscription. Idempotent (case-insensitive unique per user).
 *
 * Phase E2: also embed via Workers AI bge-base-en-v1.5 + upsert into
 * Vectorize for semantic match. Falls back to ILIKE-only when bindings
 * are unavailable (the dispatcher handles either case).
 */
import { queryOne, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'

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
    // Already exists — fetch and return
    const existing = await queryOne(
      `SELECT id, keyword, created_at FROM keyword_subscriptions WHERE user_id = $1 AND LOWER(keyword) = LOWER($2)`,
      [user.id, keyword]
    )
    return { id: existing?.id, keyword: existing?.keyword, createdAt: existing?.created_at, alreadyExisted: true }
  }

  // Best-effort: embed and upsert into Vectorize. Failure is silent —
  // the row exists and the ILIKE fallback in the dispatcher still works.
  try {
    const embedding = await generateEmbedding(event, keyword)
    if (embedding.length > 0) {
      const vectorId = `kw_${row.id}`
      await upsertVector(event, vectorId, embedding, {
        userId: user.id,
        keyword,
      })
      await execute(
        `UPDATE keyword_subscriptions SET vector_id = $1, last_embedded_at = NOW() WHERE id = $2`,
        [vectorId, row.id]
      )
    }
  } catch (err) {
    console.error('[keywords] Embedding upsert failed (using ILIKE fallback):', err)
  }

  return { id: row.id, keyword: row.keyword, createdAt: row.created_at, alreadyExisted: false }
})
