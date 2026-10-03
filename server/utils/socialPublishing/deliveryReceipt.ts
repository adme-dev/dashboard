interface Receipt { accountId?: string, platform?: string, platformAccountId?: string, platformPostId?: string, status?: string }
interface DeliveryPost {
  status?: unknown
  published_at?: unknown
  account_ids?: string[]
  platforms?: string[]
  platform_results?: Record<string, Receipt>
  metadata?: { liveFacebook?: Record<string, { removed?: boolean }> }
}
/** Saved provider acknowledgements, not a claim that every post remains live forever. */
export function publishingDelivery(post: DeliveryPost) {
  const accounts = [...new Set(post.account_ids || [])]
  const receipts = Object.values(post.platform_results || {})
  const confirmed = accounts.filter((id) => {
    const matches = receipts.filter(r => r?.accountId === id && r.status === 'success'
      && post.platforms?.includes(r.platform) && r.platformAccountId && r.platformPostId)
    return matches.length === 1
  }).length
  const removed = accounts.filter(id => post.metadata?.liveFacebook?.[id]?.removed === true).length
  const terminal = ['published', 'partially_published'].includes(String(post.status))
  const state = terminal && post.published_at && accounts.length && confirmed === accounts.length
    ? 'confirmed'
    : confirmed ? 'partial' : terminal ? 'unverified' : 'pending'
  return { state, confirmed, total: accounts.length, removed, publishedAt: post.published_at || null }
}
