/**
 * Reconcile keyword_subscriptions ↔ Vectorize.
 *
 * Two cases this fixes:
 *   1. A keyword row exists but has no vector_id (embedding never generated
 *      because Vectorize was unavailable when the keyword was added).
 *   2. A keyword row was deleted via direct DB access, leaving an orphan
 *      vector in Vectorize. (We can't enumerate Vectorize, so this case
 *      is best-effort: we attempt to delete vectors based on a list of
 *      known-removed ids supplied by the caller, OR rely on the metadata
 *      filter at query time to ignore them.)
 *
 * MVP: walks the user's keyword rows and ensures each has a vector. Any
 * row that successfully embeds gets vector_id stamped. Rows that fail to
 * embed (binding offline) are left alone for next reconcile.
 *
 * Rate limited because each row triggers a Workers AI inference.
 */
import { execute, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { generateEmbedding, upsertVector } from '~~/server/utils/aiVectorize'
import { enforceRateLimit } from '~~/server/utils/rateLimit'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  await enforceRateLimit(event, {
    key: `keyword-reconcile:${user.id}`,
    limit: 4,
    windowSeconds: 3600,
  })

  let rows: any[] = []
  try {
    rows = await queryRows(
      `SELECT id, keyword, vector_id, last_embedded_at
       FROM keyword_subscriptions
       WHERE user_id = $1`,
      [user.id]
    )
  } catch (err: any) {
    if (err?.message?.includes('does not exist')) {
      return { reconciled: 0, skipped: 0, total: 0 }
    }
    throw err
  }

  let reconciled = 0
  let skipped = 0

  await Promise.allSettled(
    rows.map(async (r) => {
      // Skip rows that already have a vector_id AND were embedded recently.
      // Re-embed if the keyword text could have changed (vector_id present
      // but mismatched id format, or last_embedded_at older than 90 days).
      const expectedId = `kw_${r.id}`
      const fresh = r.last_embedded_at
        && (Date.now() - new Date(r.last_embedded_at).getTime()) < 90 * 24 * 60 * 60 * 1000
      if (r.vector_id === expectedId && fresh) {
        skipped++
        return
      }

      try {
        const embedding = await generateEmbedding(event, r.keyword)
        if (embedding.length === 0) {
          skipped++
          return
        }
        await upsertVector(event, expectedId, embedding, {
          userId: user.id,
          keyword: r.keyword,
        })
        await execute(
          `UPDATE keyword_subscriptions SET vector_id = $1, last_embedded_at = NOW() WHERE id = $2`,
          [expectedId, r.id]
        )
        reconciled++
      } catch {
        skipped++
      }
    })
  )

  return { reconciled, skipped, total: rows.length }
})
