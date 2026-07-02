import { execute, queryOne, queryRows } from '~~/server/utils/db'
import { publishPost, type PublishableAccount, type PublishablePost, type PublishOutcome } from '~~/server/utils/socialPublishing'
import { recordSocialPublishingAudit, type SocialPublishingAuditAction } from '~~/server/utils/socialPublishing/audit'

export type SocialPublishingDispatchSource = 'manual' | 'cron' | 'workflow'

export interface ClaimAndPublishSocialPostInput {
  postId: string
  clientId?: string | null
  claimStatuses: readonly string[]
  maxAttempts?: number | null
  source: SocialPublishingDispatchSource
  actorId?: string | null
  auditAction?: SocialPublishingAuditAction
  log?: Pick<Console, 'log' | 'warn' | 'error'>
}

export interface ClaimAndPublishSocialPostResult {
  ok: true
  postId: string
  clientId?: string | null
  status?: PublishOutcome['status']
  platformResults?: PublishOutcome['platformResults']
  skipped?: boolean
  reason?: 'not_claimed'
  currentStatus?: string | null
  accountsCount?: number
  targets?: string[]
}

interface SocialPostDispatchRow extends PublishablePost {
  client_id: string
  status: string
  account_ids: string[] | null
}

interface CurrentPostState {
  id: string
  client_id: string
  status: string | null
}

const FAILED_DISPATCH_RESULT_KEY = 'dispatch'

export async function claimAndPublishSocialPost(
  input: ClaimAndPublishSocialPostInput
): Promise<ClaimAndPublishSocialPostResult> {
  const log = input.log ?? console
  const claimStatuses = normalizeClaimStatuses(input.claimStatuses)
  const claimed = await queryOne<SocialPostDispatchRow>(
    `UPDATE social_posts
        SET status='publishing', last_attempt_at=NOW(), updated_at=NOW()
      WHERE id=$1
        AND ($2::text IS NULL OR client_id=$2)
        AND status = ANY($3::text[])
        AND ($4::int IS NULL OR publish_attempts < $4)
      RETURNING *`,
    [input.postId, input.clientId ?? null, claimStatuses, input.maxAttempts ?? null]
  )

  if (!claimed) {
    const current = await queryOne<CurrentPostState>(
      'SELECT id, client_id, status FROM social_posts WHERE id=$1',
      [input.postId]
    )
    const skipped: ClaimAndPublishSocialPostResult = {
      ok: true,
      skipped: true,
      reason: 'not_claimed',
      postId: input.postId,
      clientId: current?.client_id ?? input.clientId ?? null,
      currentStatus: current?.status ?? null
    }
    log.warn('social-publishing.dispatch.skipped', {
      source: input.source,
      postId: skipped.postId,
      clientId: skipped.clientId,
      currentStatus: skipped.currentStatus,
      claimStatuses
    })
    return skipped
  }

  const published = await publishClaimedPost(claimed, input, log)
  const outcome = published.outcome
  await execute(
    `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
       publish_attempts=publish_attempts+1,
       published_at=CASE WHEN $2 IN ('published','partially_published') THEN COALESCE(published_at, NOW()) ELSE published_at END,
       updated_at=NOW()
     WHERE id=$1 AND client_id=$4`,
    [claimed.id, outcome.status, JSON.stringify(outcome.platformResults), claimed.client_id]
  )

  const targets = Object.keys(outcome.platformResults)
  if (input.auditAction) {
    await recordSocialPublishingAudit({
      clientId: claimed.client_id,
      postId: claimed.id,
      actorId: input.actorId ?? null,
      action: input.auditAction,
      metadata: {
        source: input.source,
        status: outcome.status,
        targets
      }
    })
  }

  log.log('social-publishing.dispatch.completed', {
    source: input.source,
    postId: claimed.id,
    clientId: claimed.client_id,
    status: outcome.status,
    targets
  })

  return {
    ok: true,
    postId: claimed.id,
    clientId: claimed.client_id,
    status: outcome.status,
    platformResults: outcome.platformResults,
    accountsCount: published.accountsCount,
    targets
  }
}

async function publishClaimedPost(
  post: SocialPostDispatchRow,
  input: ClaimAndPublishSocialPostInput,
  log: Pick<Console, 'error'>
): Promise<{ outcome: PublishOutcome, accountsCount: number }> {
  try {
    const accounts = await queryRows<PublishableAccount>(
      `SELECT id, platform, platform_account_id, access_token, refresh_token, token_expires_at, account_name, last_error, metadata
         FROM social_accounts
        WHERE id = ANY($1) AND client_id = $2 AND is_active = TRUE`,
      [post.account_ids ?? [], post.client_id]
    )
    return {
      outcome: await publishPost({ ...post, accounts }),
      accountsCount: accounts.length
    }
  } catch (error) {
    const message = dispatchErrorMessage(error)
    log.error('social-publishing.dispatch.failed', {
      source: input.source,
      postId: post.id,
      clientId: post.client_id,
      error: message
    })
    return {
      outcome: {
        status: 'failed',
        platformResults: {
          [FAILED_DISPATCH_RESULT_KEY]: {
            status: 'failed',
            error: message
          }
        }
      },
      accountsCount: 0
    }
  }
}

function normalizeClaimStatuses(statuses: readonly string[]): string[] {
  const normalized = Array.from(new Set(
    statuses.map(status => status.trim()).filter(Boolean)
  ))
  if (!normalized.length) throw new Error('At least one claim status is required')
  return normalized
}

function dispatchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return (message || 'Social publish dispatch failed').slice(0, 300)
}
