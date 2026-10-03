import { createError } from 'h3'
import type { Pool } from 'pg'
import { queryOneFresh, queryRowsFresh, transactionWithoutRetry } from '~~/server/utils/db'
import { facebookLiveRequest, resolveLiveFacebookTarget, type LiveFacebookAccount, type LiveFacebookPost } from './liveFacebook'
import { socialReviewVersionSql } from './reviewVersion'
import type { LiveOperationInput } from './liveOperations'

const conflict = (statusMessage: string) => createError({ statusCode: 409, statusMessage })
interface Review {
  id: string
  post_id: string
  client_id: string
  account_id: string
  provider_post_id: string
  action: string
  before_message: string
  after_message: string | null
  post_version: string
  status: string
  expired: boolean
}

async function audit(db: Pick<Pool, 'query'>, review: Review, actor: string, action: string) {
  await db.query(`INSERT INTO social_publishing_audit_events(client_id,post_id,social_account_id,actor_id,action,metadata)
    VALUES($1,$2,$3,$4,$5,$6::jsonb)`, [review.client_id, review.post_id, review.account_id, actor, action,
    JSON.stringify({ reviewRequestId: review.id, action: review.action, reviewVersion: review.post_version })])
}
export async function listLiveReviews(clientId: string, postId?: string, accountId?: string) {
  return queryRowsFresh(`SELECT r.id,r.post_id,r.account_id,r.provider_post_id,r.action,r.before_message,r.after_message,
    r.status,r.feedback,r.created_at,r.expires_at,r.responded_at,(r.expires_at<=NOW()) AS expired,
    a.account_name,t.name AS requester_name,u.name AS responder_name,o.status AS operation_status,operator.name AS operator_name,o.created_at AS operation_created_at
    FROM social_live_review_requests r
    JOIN social_accounts a ON a.id=r.account_id AND a.client_id=r.client_id
    LEFT JOIN team_members t ON t.id::text=r.requested_by
    LEFT JOIN client_users u ON u.id::text=r.responded_by AND u.client_id=r.client_id
    LEFT JOIN social_live_operations o ON o.id=r.id AND o.client_id=r.client_id
    LEFT JOIN team_members operator ON operator.id::text=o.actor_id
    WHERE r.client_id=$1 AND ($2::uuid IS NULL OR r.post_id=$2) AND ($3::uuid IS NULL OR r.account_id=$3)
    ORDER BY CASE WHEN r.status IN ('pending','approved') AND r.expires_at>NOW() THEN 0 ELSE 1 END,r.created_at DESC LIMIT 50`, [clientId, postId || null, accountId || null])
}
export async function requestLiveReview(postId: string, clientId: string, actorId: string, input: LiveOperationInput) {
  if (!['edit', 'remove'].includes(input.action)) throw conflict('Choose a caption revision or removal')
  const post = await queryOneFresh<LiveFacebookPost>('SELECT * FROM social_posts WHERE id=$1 AND client_id=$2', [postId, clientId])
  const account = await queryOneFresh<LiveFacebookAccount>('SELECT * FROM social_accounts WHERE id=$1 AND client_id=$2', [input.accountId, clientId])
  if (!post || !account) throw conflict('Post or account unavailable')
  if (!post.client_approval_status && post.metadata?.source !== 'mcp_news') throw conflict('This post does not use customer approval. Use the management controls.')
  const providerId = resolveLiveFacebookTarget(post, account)
  const live = await facebookLiveRequest(account, providerId, 'GET')
  if (live.message !== input.expectedMessage) throw conflict('The Facebook caption changed. Refresh before requesting review.')
  return transactionWithoutRetry(async (db) => {
    const locked = (await db.query<LiveFacebookPost & { review_version: string }>(`SELECT *,${socialReviewVersionSql()} AS review_version
      FROM social_posts WHERE id=$1 AND client_id=$2 FOR UPDATE`, [postId, clientId])).rows[0]
    const bound = (await db.query<LiveFacebookAccount>('SELECT * FROM social_accounts WHERE id=$1 AND client_id=$2 FOR SHARE', [account.id, clientId])).rows[0]
    if (!locked || !bound || resolveLiveFacebookTarget(locked, bound) !== providerId) throw conflict('Publishing target changed')
    const existing = (await db.query<Review>('SELECT * FROM social_live_review_requests WHERE id=$1', [input.operationId])).rows[0]
    const after = input.action === 'edit' ? input.message : null
    if (existing) {
      if (existing.post_id !== postId || existing.client_id !== clientId || existing.account_id !== account.id || existing.action !== input.action || existing.before_message !== input.expectedMessage || existing.after_message !== after) throw conflict('Request ID belongs to a different request')
      return { id: existing.id, status: existing.status }
    }
    const usedId = await db.query('SELECT id FROM social_live_operations WHERE id=$1', [input.operationId])
    if (usedId.rows.length) throw conflict('Request ID is already used by a live operation')
    const blocked = await db.query(`SELECT id FROM social_live_operations WHERE post_id=$1 AND account_id=$2
      AND (status IN ('pending','uncertain') OR (action='remove' AND status='succeeded')) LIMIT 1`, [postId, account.id])
    if (blocked.rows.length) throw conflict('This post was removed or has an unresolved operation')
    await db.query(`UPDATE social_live_review_requests SET status='superseded'
      WHERE post_id=$1 AND account_id=$2 AND status IN ('pending','approved')`, [postId, account.id])
    const review = (await db.query<Review>(`INSERT INTO social_live_review_requests
      (id,post_id,client_id,account_id,provider_post_id,requested_by,action,before_message,after_message,post_version)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [input.operationId, postId, clientId, account.id, providerId, actorId, input.action, input.expectedMessage, after, locked.review_version])).rows[0]
    if (!review) throw conflict('Could not reserve the customer review request')
    await audit(db, review, actorId, 'live_review_requested')
    return { id: review.id, status: review.status }
  })
}
export async function respondLiveReview(clientId: string, customerId: string, id: string, action: string, feedback: string) {
  const status = ({ approve: 'approved', reject: 'rejected', request_changes: 'revision_requested' } as Record<string, string>)[action]
  if (typeof status !== 'string' || (action !== 'approve' && !feedback.trim())) throw createError({ statusCode: 400, statusMessage: 'Choose a decision and include feedback for changes or rejection' })
  return transactionWithoutRetry(async (db) => {
    const review = (await db.query<Review>(`SELECT *,(expires_at<=NOW()) AS expired FROM social_live_review_requests
      WHERE id=$1 AND client_id=$2 FOR UPDATE`, [id, clientId])).rows[0]
    if (!review) throw createError({ statusCode: 404, statusMessage: 'Review request not found' })
    if (review.status !== 'pending' || review.expired) throw conflict('This request changed or expired. Refresh to review the current request.')
    await db.query(`UPDATE social_live_review_requests SET status=$2,responded_by=$3,feedback=$4,responded_at=NOW() WHERE id=$1`, [id, status, customerId, feedback.trim() || null])
    await audit(db, review, 'client:' + customerId, 'live_review_' + status)
    return { status }
  })
}
export async function consumeLiveReview(db: Pick<Pool, 'query'>, post: LiveFacebookPost & { review_version?: string }, providerId: string, input: LiveOperationInput) {
  const review = (await db.query<Review>(`SELECT *,(expires_at<=NOW()) AS expired FROM social_live_review_requests
    WHERE id=$1 AND post_id=$2 AND client_id=$3 AND account_id=$4 FOR UPDATE`, [input.reviewRequestId, post.id, post.client_id, input.accountId])).rows[0]
  if (!review || review.status !== 'approved' || review.expired) throw conflict('A current customer-approved request is required')
  if (review.provider_post_id !== providerId || review.post_version !== post.review_version) throw conflict('The post or target changed. Request a fresh customer review.')
  if (review.action !== input.action || review.before_message !== input.expectedMessage || review.after_message !== (input.action === 'edit' ? input.message : null)) throw conflict('The action and caption must match the customer-approved request')
  await db.query('UPDATE social_live_review_requests SET status=\'submitted\' WHERE id=$1', [review.id])
}
