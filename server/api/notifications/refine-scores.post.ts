/**
 * AI importance refinement.
 *
 * Phase E2: Workers AI re-scores recent notifications using fuller context
 * (title + body) and a 3-class classifier (low/normal/urgent), mapping back
 * to a 0..1 importance_score. Only refines rows where the rule-based score
 * matches the default 0.4 (suggesting low signal from rules).
 *
 * Caller (frontend) hits this opportunistically — e.g. on first inbox open
 * per session. Throttled by checking notifications.refined_at? No, we mark
 * the score as "refined" by simply leaving it. We re-pick rows where score
 * is currently 0.4 OR was scored before a cutoff.
 *
 * Returns counts: { refined, skipped }
 */
import { queryOne, queryRows, execute } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { edgeClassify } from '~~/server/utils/edgeAi'

const BATCH_LIMIT = 25 // bound the number of inferences per call
const URGENT = 0.85
const NORMAL = 0.55
const LOW = 0.20

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  // Pick recent low-confidence notifications (rule-based defaulted to 0.4)
  // that haven't been refined yet.
  const rows = await queryRows(`
    SELECT id, type, title, message, reason, metadata
    FROM notifications
    WHERE user_id = $1
      AND created_at > NOW() - INTERVAL '7 days'
      AND (importance_score IS NULL OR importance_score = 0.4)
    ORDER BY created_at DESC
    LIMIT $2
  `, [user.id, BATCH_LIMIT])

  if (rows.length === 0) {
    return { refined: 0, skipped: 0, total: 0 }
  }

  let refined = 0
  let skipped = 0

  await Promise.allSettled(
    rows.map(async (n) => {
      const text = `${n.title}\n${n.message}`.slice(0, 800)
      const result = await edgeClassify(event, text, ['urgent', 'normal', 'low'])
      if (!result) {
        skipped++
        return
      }
      const newScore =
        result.category === 'urgent' ? URGENT :
        result.category === 'normal' ? NORMAL :
        result.category === 'low' ? LOW : null
      if (newScore == null) {
        skipped++
        return
      }
      try {
        await execute(
          `UPDATE notifications SET importance_score = $1 WHERE id = $2 AND user_id = $3`,
          [newScore, n.id, user.id]
        )
        refined++
      } catch {
        skipped++
      }
    })
  )

  return { refined, skipped, total: rows.length }
})
