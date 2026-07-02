import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne } from '~~/server/utils/db'
import { claimAndPublishSocialPost } from '~~/server/utils/socialPublishing/dispatch'

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
    const dispatch = await claimAndPublishSocialPost({
      postId: id,
      claimStatuses: ['scheduled'],
      maxAttempts: 3,
      source: 'cron'
    })
    if (dispatch.skipped) continue
    results.push({ id, status: dispatch.status ?? 'failed' })
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
