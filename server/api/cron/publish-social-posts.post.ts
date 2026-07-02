import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { publishPost, type PublishableAccount, type PublishablePost } from '~~/server/utils/socialPublishing'

interface SocialPostRow extends PublishablePost {
  client_id: string
  account_ids: string[] | null
}

interface DispatchHealthRow {
  due_backlog?: number | string | null
  exhausted_failures?: number | string | null
  oldest_due_at?: string | null
}

interface DispatchHealth {
  status: 'healthy' | 'warning' | 'critical'
  dueBacklog: number
  exhaustedFailures: number
  oldestDueAt: string | null
}

/**
 * POST /api/cron/publish-social-posts
 * Dispatcher for scheduled social posts. Invoked by the social-dispatch-cron companion
 * Worker every 1-2 min (Cloudflare Pages has no scheduled() handler).
 *
 * Uses an idempotent claim (UPDATE ... WHERE status='scheduled') so overlapping
 * ticks can never double-publish a post.
 */
export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  const due = await queryRows<{ id: string }>(
    `SELECT id FROM social_posts
      WHERE scheduled_at <= NOW() AND status = 'scheduled' AND publish_attempts < 3
      ORDER BY scheduled_at ASC LIMIT 10`
  )

  const results: Array<{ id: string, status: string }> = []
  for (const { id } of due) {
    // Idempotent claim — only the tick that flips the row out of scheduled proceeds.
    const claimed = await execute(
      `UPDATE social_posts SET status='publishing', last_attempt_at=NOW(), updated_at=NOW()
        WHERE id=$1 AND status = 'scheduled'`,
      [id]
    )
    if (claimed === 0) continue

    const post = await queryOne<SocialPostRow>('SELECT * FROM social_posts WHERE id=$1', [id])
    if (!post) continue
    const accounts = await queryRows<PublishableAccount>(
      `SELECT id, platform, platform_account_id, access_token, refresh_token, token_expires_at, account_name, last_error, metadata
         FROM social_accounts
        WHERE id = ANY($1) AND client_id = $2 AND is_active = TRUE`,
      [post.account_ids ?? [], post.client_id]
    )
    const outcome = await publishPost({ ...post, accounts })
    await execute(
      `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
         publish_attempts=publish_attempts+1,
         published_at=CASE WHEN $2 IN ('published','partially_published') THEN COALESCE(published_at, NOW()) ELSE published_at END,
         updated_at=NOW()
       WHERE id=$1`,
      [id, outcome.status, JSON.stringify(outcome.platformResults)]
    )
    results.push({ id, status: outcome.status })
  }

  const health = dispatchHealth(await queryOne<DispatchHealthRow>(
    `SELECT
        COUNT(*) FILTER (
          WHERE scheduled_at <= NOW()
            AND status = 'scheduled'
            AND publish_attempts < 3
        )::int AS due_backlog,
        COUNT(*) FILTER (
          WHERE scheduled_at <= NOW()
            AND status IN ('scheduled','failed')
            AND publish_attempts >= 3
        )::int AS exhausted_failures,
        (MIN(scheduled_at) FILTER (
          WHERE scheduled_at <= NOW()
            AND status = 'scheduled'
        ))::text AS oldest_due_at
       FROM social_posts`
  ))

  if (health.status !== 'healthy') console.warn('social-dispatch.health', health)
  console.log('social-dispatch.run', { due: due.length, processed: results.length, health })
  return { processed: results.length, results, health }
})

function dispatchHealth(row: DispatchHealthRow | null): DispatchHealth {
  const dueBacklog = Number(row?.due_backlog ?? 0)
  const exhaustedFailures = Number(row?.exhausted_failures ?? 0)
  const status = exhaustedFailures > 0
    ? 'critical'
    : dueBacklog >= 10 ? 'warning' : 'healthy'

  return {
    status,
    dueBacklog: Number.isFinite(dueBacklog) ? dueBacklog : 0,
    exhaustedFailures: Number.isFinite(exhaustedFailures) ? exhaustedFailures : 0,
    oldestDueAt: row?.oldest_due_at ?? null
  }
}
