import { consumeLiveReview, listLiveReviews } from './liveReviews'
import { socialReviewVersionSql } from './reviewVersion'
import { createError } from 'h3'
import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { assertLiveRevisionAllowed, facebookLiveRequest, resolveLiveFacebookTarget, type LiveFacebookAccount, type LiveFacebookPost } from './liveFacebook'

const fail = (message: string) => createError({ statusCode: 409, statusMessage: message })
interface Operation { id: string, post_id: string, client_id: string, account_id: string, provider_post_id: string, action: 'edit' | 'remove', status: string, before_message: string, after_message: string | null }
export interface LiveOperationInput { operationId: string, reviewRequestId?: string, accountId: string, action: 'edit' | 'remove' | 'reconcile', expectedMessage?: string, message?: string }
async function target(postId: string, clientId: string, accountId: string) {
  const post = await queryOneFresh<LiveFacebookPost>('SELECT * FROM social_posts WHERE id=$1 AND client_id=$2', [postId, clientId])
  const account = await queryOneFresh<LiveFacebookAccount>('SELECT * FROM social_accounts WHERE id=$1 AND client_id=$2', [accountId, clientId])
  if (!post || !account) throw fail('Post or account unavailable')
  return { post, account, providerId: resolveLiveFacebookTarget(post, account) }
}
export async function readLiveFacebook(postId: string, clientId: string, accountId: string) {
  const { post, account, providerId } = await target(postId, clientId, accountId)
  const operations = await queryRowsFresh(`SELECT o.id,o.action,o.status,o.before_message,o.after_message,o.created_at,o.completed_at,t.name AS actor_name
    FROM social_live_operations o LEFT JOIN team_members t ON t.id::text=o.actor_id
    WHERE o.post_id=$1 AND o.client_id=$2 AND o.account_id=$3 ORDER BY o.created_at DESC LIMIT 50`, [postId, clientId, accountId])
  const removed = operations.some(o => o.action === 'remove' && o.status === 'succeeded')
  let live: { message: string } | null = null
  let readError = ''
  if (!removed) {
    try {
      live = await facebookLiveRequest(account, providerId, 'GET')
    } catch {
      readError = 'Could not read the current Facebook caption. Check the Page connection and open the live post.'
    }
  }
  return { accountName: account.account_name, providerId, message: live?.message ?? null, removed, operations,
    readError, reviews: await listLiveReviews(clientId, postId, accountId), customerApprovalRequired: !!post.client_approval_status || post.metadata?.source === 'mcp_news' }
}
async function finish(op: Operation, actorId: string, status: 'succeeded' | 'failed' | 'uncertain', source: string) {
  const outcome = await transactionWithoutRetry(async (db) => {
    const changed = await db.query(`UPDATE social_live_operations SET status=$2,completed_at=CASE WHEN $2 IN ('succeeded','failed') THEN NOW() ELSE NULL END
      WHERE id=$1 AND status IN ('pending','uncertain') RETURNING id`, [op.id, status])
    if (!changed.rows.length) {
      const current = await db.query<{ status: string }>('SELECT status FROM social_live_operations WHERE id=$1', [op.id])
      return current.rows[0]?.status || 'uncertain'
    }
    await db.query(`INSERT INTO social_publishing_audit_events(client_id,post_id,social_account_id,actor_id,action,metadata)
      VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [op.client_id, op.post_id, op.account_id, actorId, 'live_post_' + op.action,
      JSON.stringify({ operationId: op.id, status, source })])
    if (status === 'succeeded') {
      await db.query(`UPDATE social_posts SET metadata=jsonb_set(COALESCE(metadata,'{}'::jsonb),'{liveFacebook}',
        COALESCE(metadata->'liveFacebook','{}'::jsonb) || jsonb_build_object($2::text,$3::jsonb)),updated_at=NOW()
        WHERE id=$1 AND client_id=$4`, [op.post_id, op.account_id, JSON.stringify({ removed: op.action === 'remove', message: op.after_message, operationId: op.id }), op.client_id])
    }
    return status
  })
  return { operationId: op.id, status: outcome }
}
export async function manageLiveFacebook(postId: string, clientId: string, actorId: string, input: LiveOperationInput) {
  const { post, account, providerId } = await target(postId, clientId, input.accountId)
  if (input.action === 'reconcile') {
    const op = await queryOneFresh<Operation>('SELECT * FROM social_live_operations WHERE id=$1 AND post_id=$2 AND client_id=$3 AND account_id=$4', [input.operationId, postId, clientId, account.id])
    if (!op) throw fail('Operation not found for this post and account')
    if (!['pending', 'uncertain'].includes(op.status)) return { operationId: op.id, status: op.status }
    if (op.provider_post_id !== providerId) throw fail('Publishing target changed')
    if (op.action === 'remove') throw fail('Removal is unconfirmed. Check Facebook; further changes remain blocked to prevent duplicate requests.')
    const current = await facebookLiveRequest(account, providerId, 'GET')
    if (current.message !== op.after_message) throw fail('Facebook has not confirmed the requested caption. Further changes remain blocked.')
    return finish(op, actorId, 'succeeded', 'reconciled')
  }
  if (!input.reviewRequestId) assertLiveRevisionAllowed(post)
  if (input.reviewRequestId && input.operationId !== input.reviewRequestId) throw fail('Use the approved review request ID for this operation')
  // Reserve before any provider write. Post lock plus unique unresolved-target index serializes requests.
  const reserved = await transactionWithoutRetry(async (db) => {
    const locked = (await db.query<LiveFacebookPost & { review_version: string }>(`SELECT *,${socialReviewVersionSql()} AS review_version FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE`, [postId, clientId])).rows[0]
    const bound = (await db.query<LiveFacebookAccount>('SELECT * FROM social_accounts WHERE id=$1 AND client_id=$2 FOR SHARE', [account.id, clientId])).rows[0]
    if (!locked || !bound || resolveLiveFacebookTarget(locked, bound) !== providerId) throw fail('Publishing target changed')
    if (!input.reviewRequestId) assertLiveRevisionAllowed(locked)
    const existing = (await db.query<Operation>('SELECT * FROM social_live_operations WHERE id=$1', [input.operationId])).rows[0]
    if (existing) {
      if (existing.post_id !== postId || existing.client_id !== clientId || existing.account_id !== account.id || existing.action !== input.action || existing.before_message !== input.expectedMessage || existing.after_message !== (input.action === 'edit' ? input.message : null)) throw fail('Operation ID belongs to a different request')
      return { op: existing, fresh: false }
    }
    if (input.reviewRequestId) await consumeLiveReview(db, locked, providerId, input)
    const blocked = (await db.query(`SELECT id FROM social_live_operations WHERE post_id=$1 AND account_id=$2
      AND (status IN ('pending','uncertain') OR (action='remove' AND status='succeeded')) LIMIT 1`, [postId, account.id])).rows[0]
    if (blocked) throw fail('This target was removed or has an unresolved operation. Check its history before continuing.')
    const op = (await db.query<Operation>(`INSERT INTO social_live_operations(id,post_id,client_id,account_id,provider_post_id,actor_id,action,status,before_message,after_message)
      VALUES($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9) RETURNING *`, [input.operationId, postId, clientId, account.id, providerId, actorId, input.action, input.expectedMessage, input.action === 'edit' ? input.message : null])).rows[0]
    if (!op) throw fail('Could not reserve the live operation')
    await db.query(`INSERT INTO social_publishing_audit_events(client_id,post_id,social_account_id,actor_id,action,metadata)
      VALUES($1,$2,$3,$4,'live_post_requested',$5::jsonb)`, [clientId, postId, account.id, actorId, JSON.stringify({ operationId: op.id, status: 'pending', source: input.action })])
    return { op, fresh: true }
  })
  if (!reserved.fresh) return { operationId: reserved.op.id, status: reserved.op.status }
  const op = reserved.op
  let before: { message: string }
  try {
    before = await facebookLiveRequest(account, providerId, 'GET')
  } catch {
    await finish(op, actorId, 'failed', 'preflight_unavailable')
    throw fail('Could not read the live post. No change was sent to Facebook.')
  }
  if (before.message !== input.expectedMessage) {
    await finish(op, actorId, 'failed', 'caption_changed')
    throw fail('The caption changed on Facebook. Reload and review the current version.')
  }
  try {
    await facebookLiveRequest(account, providerId, input.action === 'edit' ? 'POST' : 'DELETE', input.message)
    if (input.action === 'edit' && (await facebookLiveRequest(account, providerId, 'GET')).message !== input.message) throw new Error('Unconfirmed caption')
  } catch {
    return finish(op, actorId, 'uncertain', 'provider_unconfirmed')
  }
  return finish(op, actorId, 'succeeded', 'manual')
}
