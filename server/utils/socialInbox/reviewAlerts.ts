import { isLowReviewRating, isRecentReview } from './reviewSafety'

interface ReviewDb {
  execute(sql: string, params?: unknown[]): Promise<number>
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}
export interface ReviewAlert {
  id: string
  client_id: string
  account_name: string
  rating: number
}

export async function flagReviewForAttention(
  db: Pick<ReviewDb, 'execute'>, conversationId: string,
  review: { rating?: number | null, platformTimestamp?: string | null, hasReply?: boolean }
) {
  if (!isLowReviewRating(review.rating) || review.hasReply) return
  await db.execute(`UPDATE social_conversations SET priority = 'urgent',
      metadata = metadata || jsonb_build_object('reviewAlertPending',
        CASE WHEN metadata ? 'reviewAlertDeliveredAt' THEN false
             ELSE COALESCE((metadata->>'reviewAlertPending')::boolean, false) OR $2::boolean END),
      updated_at = NOW()
    WHERE id = $1 AND first_response_at IS NULL AND status <> 'closed'`,
  [conversationId, isRecentReview(review.platformTimestamp)])
}

/** Failed email delivery stays pending. The transport uses a per-review idempotency key. */
export async function processReviewAlerts(db: ReviewDb, send: (review: ReviewAlert) => Promise<boolean>, canContinue: () => boolean = () => true): Promise<number> {
  const pending = await db.queryRows<ReviewAlert>(`SELECT c.id, c.client_id, c.rating,
      COALESCE(a.account_name, ac.name) AS account_name
    FROM social_conversations c
    JOIN agency_clients ac ON ac.id = c.client_id
    LEFT JOIN social_accounts a ON a.id = c.social_account_id
    WHERE c.channel_type = 'review' AND c.rating BETWEEN 1 AND 3
      AND c.first_response_at IS NULL AND c.status <> 'closed'
      AND c.metadata->>'reviewAlertPending' = 'true'
    ORDER BY c.created_at ASC LIMIT 20`)
  let delivered = 0
  for (const review of pending) {
    if (!canContinue()) break
    try {
      if (!await send(review)) continue
      await db.execute(`UPDATE social_conversations SET metadata = metadata ||
        jsonb_build_object('reviewAlertPending', false, 'reviewAlertDeliveredAt', NOW()) WHERE id = $1`, [review.id])
      delivered++
    } catch (error) {
      console.error('social-review-alert.failed', { conversationId: review.id, error: error instanceof Error ? error.message : 'Delivery failed' })
    }
  }
  return delivered
}
