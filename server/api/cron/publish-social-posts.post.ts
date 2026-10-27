import { requireSocialCronAuth } from '~~/server/utils/socialPublishing/cronAuth'
import { defineEventHandler } from 'h3'
import { execute, queryRowsFresh, queryOneFresh } from '~~/server/utils/db'
import { agencyWorkflowConfigText, startSocialPublishingWorkflow } from '~~/server/utils/agencyWorkflows/client'
import { claimAndPublishSocialPost } from '~~/server/utils/socialPublishing/dispatch'

interface DuePostRow {
  id: string
  client_id: string
  scheduled_at: string | null
  approved_revision_id?: string | null
}

/**
 * A delegated approval that expired before dispatch is never published late: the revision expires and
 * the post returns to draft for a new reviewed schedule.
 */
const EXPIRE_DELEGATED_APPROVALS_SQL = `
  WITH expired AS (
    UPDATE social_post_revisions r
       SET review_status = 'expired'
      FROM social_posts p
     WHERE p.review_policy = 'delegated_marketing' AND p.status IN ('approved', 'scheduled')
       AND r.id = p.approved_revision_id AND r.post_id = p.id AND r.client_id = p.client_id
       AND r.review_status = 'approved' AND r.expires_at <= NOW()
    RETURNING r.post_id, r.client_id
  )
  UPDATE social_posts p
     SET status = 'draft', approved_by = NULL, approved_at = NULL, approved_revision_id = NULL,
         rejection_reason = 'Approval expired before dispatch; resubmit for review', updated_at = NOW()
    FROM expired
   WHERE p.id = expired.post_id AND p.client_id = expired.client_id AND p.status IN ('approved', 'scheduled')`

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
  requireSocialCronAuth(event)

  try {
    await execute(EXPIRE_DELEGATED_APPROVALS_SQL)
  } catch (error) {
    // Expired approvals are also excluded from the due query below, so a failed sweep cannot publish late.
    console.warn('social-dispatch.expire-approvals.failed', { error: error instanceof Error ? error.message : String(error) })
  }

  const due = await queryRowsFresh<DuePostRow>(
    `SELECT id, client_id, scheduled_at::text, approved_revision_id
       FROM social_posts
      WHERE scheduled_at <= NOW() AND status = 'scheduled' AND publish_attempts < 3
        AND (review_policy IS DISTINCT FROM 'delegated_marketing' OR EXISTS (
          SELECT 1 FROM social_post_revisions r
           WHERE r.id = social_posts.approved_revision_id AND r.post_id = social_posts.id
             AND r.review_status = 'approved' AND r.expires_at > NOW()
        ))
      ORDER BY scheduled_at ASC LIMIT 10`
  )

  const results: Array<{ id: string, status: string, workflowInstanceId?: string }> = []
  for (const post of due) {
    if (scheduledPublishingWorkflowPrimary(event)) {
      const started = await startSocialPublishingWorkflow(event, {
        postId: post.id,
        clientId: post.client_id,
        scheduledAt: post.scheduled_at ?? undefined,
        trigger: 'cron',
        requestedBy: 'social-dispatch-cron',
        ...(post.approved_revision_id ? { revisionId: post.approved_revision_id } : {})
      })
      if (started.ok) {
        results.push({ id: post.id, status: 'workflow_started', workflowInstanceId: started.instanceId })
        continue
      }
      console.warn('social-dispatch.workflow-start.failed', {
        postId: post.id,
        clientId: post.client_id,
        reason: started.reason
      })
    }

    const dispatch = await claimAndPublishSocialPost({
      postId: post.id,
      scheduledAt: post.scheduled_at,
      claimStatuses: ['scheduled'],
      maxAttempts: 3,
      source: 'cron',
      event,
      revisionId: post.approved_revision_id ?? null
    })
    if (dispatch.skipped) continue
    results.push({ id: post.id, status: dispatch.status ?? 'failed' })
  }

  const health = dispatchHealth(await queryOneFresh<DispatchHealthRow>(
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

/** Request bindings first, local env second; an explicit binding value (even "false") wins. */
function scheduledPublishingWorkflowPrimary(event: Parameters<typeof agencyWorkflowConfigText>[0]): boolean {
  return agencyWorkflowConfigText(event, 'AGENCY_WORKFLOWS_ENABLED') === 'true'
    && agencyWorkflowConfigText(event, 'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY') === 'true'
}

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
