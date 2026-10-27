import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { execute, queryRowsFresh, queryOneFresh, transaction } from '~~/server/utils/db'
import { fetchTikTokPublishStatus, usableTikTokPublishId, type TikTokStatusResult } from '~~/server/utils/social-providers/tiktok'
import { outcomeStatus, refreshableAccessToken, type PublishableAccount, type PublishablePost, type PublishOutcome, type PublishTargetResult } from '~~/server/utils/socialPublishing'
import { assertMarketingCapabilityAtBoundary, requireIndependentMarketingReviewer } from '~~/server/utils/ai/marketing/reviewAuthority'
import { assertSocialMediaAssetsCurrent } from './mediaAssets'
import { buildSocialPostSnapshot, socialSnapshotHash } from './revisions'

/** Reserve the complete target set atomically before any publication. */
export async function reserveSocialTargetAttempts(clientId: string, postId: string, revisionId: string, attempt: number, post: PublishablePost) {
  await transaction(async db => {
    await db.query('SELECT id FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE', [postId,clientId])
    for (const target of post.publish_targets ?? []) {
      const account = post.accounts.find(a => a.id === target.accountId)!
      await db.query(`INSERT INTO social_post_target_attempts
        (client_id,post_id,revision_id,account_id,platform,platform_account_id,target_key,dispatch_attempt,state)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'queued')`,
      [clientId,postId,revisionId,account.id,target.platform,account.platform_account_id,`${target.platform}:${account.id}`,attempt])
    }
    await projectDurableTargets(db, postId, clientId, revisionId, attempt)
  })
}

/** Save once even if the queued claim has already been held unknown. Terminal rows never change. */
export async function recordSocialTargetOutcome(postId: string, clientId: string, revisionId: string, attempt: number, key: string, result: PublishTargetResult) {
  await transaction(async db => {
    await db.query('SELECT id FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE', [postId,clientId])
    const row = (await db.query(`SELECT a.* FROM social_post_target_attempts a
      JOIN social_post_revisions r ON r.id=a.revision_id AND r.post_id=a.post_id AND r.client_id=a.client_id
      WHERE a.post_id=$1 AND a.client_id=$2 AND a.revision_id=$3 AND a.dispatch_attempt=$4 AND a.target_key=$5
        AND r.dispatch_attempt=a.dispatch_attempt AND r.review_status='dispatch_claimed' FOR UPDATE OF a`,
    [postId,clientId,revisionId,attempt,key])).rows[0]
    if (!row) throw new Error('Reviewed target reservation lost; publication held')
    const existing = (await db.query('SELECT result FROM social_post_target_receipts WHERE attempt_id=$1',[row.id])).rows[0]
    if (existing) throw new Error('Initial target receipt already recorded; publication held')
    await db.query('INSERT INTO social_post_target_receipts(attempt_id,result) VALUES($1,$2::jsonb)',[row.id,JSON.stringify(result)])
    if (row.state === 'queued') {
      const state = result.status === 'success' ? 'published' : result.status
      const changed = await db.query(`UPDATE social_post_target_attempts SET state=$2,publish_id=$3,provider_status=$4,
        provider_receipt=$5::jsonb,next_poll_at=CASE WHEN $2='accepted' THEN NOW()+INTERVAL '30 seconds' ELSE NULL END,
        lease_token=NULL,lease_until=NULL,updated_at=NOW() WHERE id=$1 AND state='queued' RETURNING id`,
      [row.id,state,row.platform === 'tiktok' && usableTikTokPublishId(result.platformPostId) ? result.platformPostId : null,
        result.providerStatus ?? null,JSON.stringify({init:result.providerReceipt ?? {},latest:result.providerReceipt ?? {}})])
      if (!changed.rows.length) throw new Error('Queued target claim lost; publication held')
    }
    // A terminal unknown row can acquire separate late evidence, but never a new dispatch authority.
    await projectDurableTargets(db,postId,clientId,revisionId,attempt)
  })
}

/** Comment evidence is separate from the immutable publication receipt; neither authorizes replay. */
export async function recordSocialFirstCommentOutcome(postId: string, clientId: string, revisionId: string, attempt: number, key: string, result: NonNullable<PublishTargetResult['firstComment']>) {
  await transaction(async db => {
    await db.query('SELECT id FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE', [postId,clientId])
    const row = (await db.query(`SELECT a.id FROM social_post_target_attempts a
      JOIN social_post_revisions r ON r.id=a.revision_id AND r.post_id=a.post_id AND r.client_id=a.client_id
      WHERE a.post_id=$1 AND a.client_id=$2 AND a.revision_id=$3 AND a.dispatch_attempt=$4 AND a.target_key=$5
        AND r.dispatch_attempt=a.dispatch_attempt AND r.review_status='dispatch_claimed'`, [postId,clientId,revisionId,attempt,key])).rows[0]
    if (!row) throw new Error('Reviewed comment reservation lost; delivery held')
    await db.query('INSERT INTO social_post_first_comment_receipts(attempt_id,result) VALUES($1,$2::jsonb)', [row.id,JSON.stringify(result)])
    await projectDurableTargets(db,postId,clientId,revisionId,attempt)
  })
}

/** Caller holds the post lock. Read every reserved target, not a possibly incomplete post projection. */
async function projectDurableTargets(db: any, postId: string, clientId: string, revisionId: string, attempt: number): Promise<{status: PublishOutcome['status'] | 'publishing', platformResults: PublishOutcome['platformResults']} | null> {
  const post = (await db.query(`SELECT p.* FROM social_posts p JOIN social_post_revisions r ON r.id=$3
    AND r.post_id=p.id AND r.client_id=p.client_id WHERE p.id=$1 AND p.client_id=$2
    AND p.current_revision_id=r.id AND p.approved_revision_id=r.id AND r.dispatch_attempt=$4 AND r.review_status='dispatch_claimed'`,
  [postId,clientId,revisionId,attempt])).rows[0]
  if (!post) return null
  const rows = (await db.query(`SELECT a.*, i.result AS initial_result, c.result AS comment_result FROM social_post_target_attempts a
    LEFT JOIN social_post_target_receipts i ON i.attempt_id=a.id
    LEFT JOIN social_post_first_comment_receipts c ON c.attempt_id=a.id
    WHERE a.post_id=$1 AND a.client_id=$2 AND a.revision_id=$3 AND a.dispatch_attempt=$4 ORDER BY a.target_key`,
  [postId,clientId,revisionId,attempt])).rows
  const results: PublishOutcome['platformResults'] = {}
  // Legacy 486 attempts only reserved TikTok: retain their other durable results during rolling upgrade.
  for (const target of post.publish_targets ?? []) {
    const key = `${target.platform}:${target.accountId}`
    results[key] = post.platform_results?.[key] ?? { platform:target.platform,accountId:target.accountId,status:'queued' }
  }
  for (const row of rows) {
    const initial = row.initial_result ?? post.platform_results?.[row.target_key] ?? {}
    results[row.target_key] = { ...initial,platform:row.platform,accountId:row.account_id,platformAccountId:row.platform_account_id,
      ...(row.comment_result ? {firstComment:row.comment_result} : {}),
      status:row.state === 'published' ? 'success' : row.state,
      ...(row.publish_id ? {platformPostId:row.publish_id} : {}),
      ...(row.provider_status ? {providerStatus:row.provider_status} : {}),
      providerReceipt:row.provider_receipt.latest ?? initial.providerReceipt,
      error:row.provider_receipt.latest?.failReason ?? initial.error ?? null,
      publicPostIds:row.provider_receipt.latest?.publicPostIds ?? [],nextPollAt:row.next_poll_at?.toISOString() ?? null,
      ...(row.state === 'unknown' && row.initial_result ? {initialReceipt:row.initial_result} : {}) }
  }
  const values = Object.values(results)
  const status = values.some(r=>r.status==='queued') && !values.some(r=>r.status==='accepted'||r.status==='unknown')
    ? 'publishing' : outcomeStatus(values.filter(r=>r.status==='success').length,values.filter(r=>r.status==='failed'||['failed','unknown'].includes(r.firstComment?.status ?? '')).length,
    values.filter(r=>r.status==='unknown').length,values.filter(r=>r.status==='accepted'||r.status==='queued').length)
  await db.query(`UPDATE social_posts SET platform_results=$3::jsonb,status=$4,updated_at=NOW(),
    published_at=CASE WHEN $4 IN ('published','partially_published') THEN COALESCE(published_at,NOW()) ELSE published_at END
    WHERE id=$1 AND client_id=$2`,[postId,clientId,JSON.stringify(results),status])
  return {status,platformResults:results}
}

/** Final initial outcome and current projection commit under the same post lock used by reconciliation. */
export async function finalizeSocialDispatch(postId: string, clientId: string, revisionId: string, attempt: number, outcome: PublishOutcome) {
  return await transaction(async db => {
    await db.query('SELECT id FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE',[postId,clientId])
    const finalized = await db.query(`UPDATE social_post_revisions SET dispatch_outcome=$5
      WHERE id=$3 AND post_id=$1 AND client_id=$2 AND dispatch_attempt=$4 AND review_status='dispatch_claimed' AND dispatch_outcome IS NULL RETURNING id`,
    [postId,clientId,revisionId,attempt,outcome.status])
    const current = await projectDurableTargets(db,postId,clientId,revisionId,attempt)
    if (current?.status === 'publishing') throw new Error('Dispatch has unfinished target reservations; publication held')
    if (finalized.rows.length) await db.query(`UPDATE social_posts SET publish_attempts=publish_attempts+1 WHERE id=$1 AND client_id=$2`,[postId,clientId])
    return current ? {status:current.status,platformResults:current.platformResults} : outcome
  })
}
interface Attempt {
  id: string; client_id: string; post_id: string; revision_id: string; account_id: string
  platform_account_id: string; target_key: string; dispatch_attempt: number; publish_id: string
  poll_count: number; created_at: string; lease_token: string; state: string
}
/** Bounded reads only. No init API is reachable from this service. */
export async function reconcileDueSocialPostTargets(input: { event: H3Event, limit?: number }) {
  const limit = Math.min(5, Math.max(1, Math.trunc(input.limit ?? 5)))
  const summary = { claimed: 0, published: 0, failed: 0, accepted: 0, unknown: 0 }
  // An interrupted init has no usable receipt. Preserve the evidence and hold it without replay.
  const abandonedLease = randomUUID()
  const abandoned = await queryRowsFresh<Attempt>(`WITH due AS (
    SELECT id FROM social_post_target_attempts WHERE state='queued' AND created_at < NOW()-INTERVAL '10 minutes'
      AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2
    ) UPDATE social_post_target_attempts a SET lease_token=$1,lease_until=NOW()+INTERVAL '90 seconds'
      FROM due WHERE a.id=due.id RETURNING a.*`, [abandonedLease, limit])
  for (const row of abandoned) await projectAttempt(row, { state: 'unknown', providerStatus: 'dispatch_interrupted', providerReceipt: { code: null, logId: null } }, abandonedLease)
  for (let index = 0; index < limit; index++) {
    const lease = randomUUID()
    const row = await queryOneFresh<Attempt>(`WITH due AS (
      SELECT id FROM social_post_target_attempts WHERE platform='tiktok' AND state='accepted' AND next_poll_at<=NOW()
        AND (lease_until IS NULL OR lease_until<NOW()) ORDER BY next_poll_at,id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE social_post_target_attempts a SET lease_token=$1,lease_until=NOW()+INTERVAL '90 seconds',updated_at=NOW()
      FROM due WHERE a.id=due.id RETURNING a.*`, [lease])
    if (!row) break
    summary.claimed++
    let result: TikTokStatusResult
    try {
      const post = await queryOneFresh<any>('SELECT * FROM social_posts WHERE id=$1 AND client_id=$2', [row.post_id, row.client_id])
      const revision = await queryOneFresh<any>('SELECT * FROM social_post_revisions WHERE id=$1 AND post_id=$2 AND client_id=$3', [row.revision_id, row.post_id, row.client_id])
      if (!post || !revision || post.current_revision_id !== row.revision_id || post.approved_revision_id !== row.revision_id
        || revision.review_status !== 'dispatch_claimed' || revision.dispatch_attempt !== row.dispatch_attempt
        || post.approved_by !== revision.reviewed_by
        || (post.metadata?.source === 'mcp_news' && (post.client_approval_status !== 'approved' || post.client_approval_revision_id !== row.revision_id))
        || !revision.snapshot.targets.some((t: any) => t.platform === 'tiktok' && t.accountId === row.account_id)
        || socialSnapshotHash(buildSocialPostSnapshot(post, revision.snapshot.media ?? [])) !== revision.content_hash) throw new Error('review_binding_changed')
      await assertMarketingCapabilityAtBoundary(input.event, revision.requested_by, row.client_id, 'social_draft')
      await requireIndependentMarketingReviewer(input.event, { requesterId: revision.requested_by, reviewerId: revision.reviewed_by, clientId: row.client_id })
      const account = await queryOneFresh<PublishableAccount>(`SELECT * FROM social_accounts WHERE id=$1 AND client_id=$2
        AND platform='tiktok' AND platform_account_id=$3 AND is_active=TRUE`, [row.account_id, row.client_id, row.platform_account_id])
      if (!account) throw new Error('account_binding_changed')
      await assertSocialMediaAssetsCurrent({ event: input.event, clientId: row.client_id, identities: revision.snapshot.media ?? [] })
      const token = await refreshableAccessToken(account, true, input.event)
      result = await fetchTikTokPublishStatus(token, row.publish_id)
      if (['access_token_invalid','scope_not_authorized'].includes(result.providerReceipt.code ?? '')) {
        await execute(`UPDATE social_accounts SET last_error='TikTok token or scope invalid; reconnect required',updated_at=NOW()
          WHERE id=$1 AND client_id=$2 AND platform_account_id=$3 AND access_token=$4 AND is_active=TRUE`, [row.account_id,row.client_id,row.platform_account_id,token])
      }
    } catch {
      // Authority/read failures never prove content failure. Hold for bounded later inspection.
      result = { state: 'accepted', providerStatus: 'reconciliation_unavailable', providerReceipt: { code: null, logId: null } }
    }
    if (result.state === 'accepted' && (row.poll_count + 1 >= 20 || Date.now() - Date.parse(String(row.created_at)) >= 24 * 60 * 60 * 1000)) {
      result = { ...result, state: 'unknown', providerStatus: 'reconciliation_limit_reached' }
    }
    await projectAttempt(row, result, lease)
    summary[result.state]++
  }
  return summary
}
async function projectAttempt(row: Attempt, result: TikTokStatusResult, lease: string) {
  await transaction(async db => {
    // Serialize the post projection before writing a target so concurrent targets cannot lose results.
    const post = (await db.query('SELECT * FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE', [row.post_id,row.client_id])).rows[0]
    if (!post) return
    {
      const changed = await db.query(`UPDATE social_post_target_attempts SET state=$3,provider_status=$4,provider_receipt=provider_receipt || jsonb_build_object('latest',$5::jsonb),
        poll_count=poll_count+CASE WHEN state='accepted' THEN 1 ELSE 0 END,next_poll_at=CASE WHEN $3='accepted' THEN NOW()+($6::int * INTERVAL '1 second') ELSE NULL END,
        lease_token=NULL,lease_until=NULL,updated_at=NOW()
        WHERE id=$1 AND lease_token=$2 AND state=$7 RETURNING next_poll_at`,
      [row.id,lease,result.state,result.providerStatus,JSON.stringify({ ...result.providerReceipt, publicPostIds: result.publicPostIds ?? [], failReason: result.error ?? null }),Math.min(3600,30 * 2 ** Math.min(row.poll_count,7)), row.state])
      if (!changed.rows.length) return
    }
    await projectDurableTargets(db,row.post_id,row.client_id,row.revision_id,row.dispatch_attempt)
    // Do not update social_post_revisions.dispatch_outcome: that initial receipt is immutable.
  })
}
