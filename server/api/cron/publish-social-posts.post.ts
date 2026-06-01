import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { publishPost } from '~~/server/utils/socialPublishing'

/**
 * POST /api/cron/publish-social-posts
 * Dispatcher for scheduled social posts. Invoked by the social-dispatch-cron companion
 * Worker every 1-2 min (Cloudflare Pages has no scheduled() handler).
 *
 * Uses an idempotent claim (UPDATE ... WHERE status IN ('scheduled','approved')) so overlapping
 * ticks can never double-publish a post.
 */
export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const due = await queryRows<{ id: string }>(
    `SELECT id FROM social_posts
      WHERE scheduled_at <= NOW() AND status IN ('scheduled','approved') AND publish_attempts < 3
      ORDER BY scheduled_at ASC LIMIT 10`,
  )

  const results: Array<{ id: string; status: string }> = []
  for (const { id } of due) {
    // Idempotent claim — only the tick that flips the row out of scheduled/approved proceeds.
    const claimed = await execute(
      `UPDATE social_posts SET status='publishing', last_attempt_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND status IN ('scheduled','approved')`,
      [id],
    )
    if (claimed === 0) continue

    const post = await queryOne<any>('SELECT * FROM social_posts WHERE id=$1', [id])
    const accounts = await queryRows<any>(
      `SELECT id, platform, platform_account_id, access_token, account_name
         FROM social_accounts WHERE id = ANY($1) AND is_active = TRUE`,
      [post.account_ids ?? []],
    )
    const outcome = await publishPost({ ...post, accounts })
    await execute(
      `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
         publish_attempts=publish_attempts+1, published_at=COALESCE(published_at, NOW()), updated_at=NOW()
       WHERE id=$1`,
      [id, outcome.status, JSON.stringify(outcome.platformResults)],
    )
    results.push({ id, status: outcome.status })
  }

  console.log('social-dispatch.run', { due: due.length, processed: results.length })
  return { processed: results.length, results }
})
