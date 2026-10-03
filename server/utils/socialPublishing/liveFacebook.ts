import { createError } from 'h3'
import { fetchWithTimeout } from '~~/server/utils/social-providers/http'

export interface LiveFacebookAccount { id: string, client_id: string, platform: string, platform_account_id: string, access_token: string, is_active: boolean, account_name: string }
export interface LiveFacebookPost { id: string, client_id: string, status: string, client_approval_status?: string | null, metadata?: { source?: string }, account_ids: string[], platform_results: Record<string, { accountId?: string, status?: string, platform?: string, platformAccountId?: string, platformPostId?: string }> }
export function resolveLiveFacebookTarget(post: LiveFacebookPost, account: LiveFacebookAccount) {
  if (post.client_id !== account.client_id || !post.account_ids?.includes(account.id)) throw createError({ statusCode: 409, statusMessage: 'Publishing account does not belong to this post' })
  if (!['published', 'partially_published'].includes(post.status) || account.platform !== 'facebook' || !account.is_active || !account.access_token) throw createError({ statusCode: 409, statusMessage: 'An active Facebook account and published post are required' })
  const receipts = Object.values(post.platform_results || {}).filter(r => r?.accountId === account.id && r.status === 'success' && r.platform === 'facebook' && r.platformAccountId === account.platform_account_id)
  if (receipts.length !== 1 || !/^\d+_\d+$/.test(receipts[0].platformPostId) || !receipts[0].platformPostId.startsWith(`${account.platform_account_id}_`)) throw createError({ statusCode: 422, statusMessage: 'Only verified Facebook feed posts are supported. Open videos or other post types on Facebook.' })
  return String(receipts[0].platformPostId)
}
export function assertLiveRevisionAllowed(post: LiveFacebookPost) {
  if (post.client_approval_status || post.metadata?.source === 'mcp_news') throw createError({ statusCode: 409, statusMessage: 'This post requires a versioned customer approval before it can be changed here.' })
}
export async function facebookLiveRequest(account: LiveFacebookAccount, providerId: string, method: 'GET' | 'POST' | 'DELETE', message?: string) {
  const url = `https://graph.facebook.com/v25.0/${providerId}${method === 'GET' ? '?fields=id,message,from' : ''}`
  const response = await fetchWithTimeout(url, {
    method, timeoutMs: 20000, redirect: 'manual',
    headers: { 'Authorization': `Bearer ${account.access_token}`, 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ message }) } : {})
  })
  if (!response.ok) throw createError({ statusCode: 502, statusMessage: 'Facebook could not confirm this request. Check the Page connection and live post.' })
  const value = await response.json() as { id?: string, message?: string, from?: { id?: string }, success?: boolean } | boolean
  if (method === 'GET') {
    if (!value || typeof value !== 'object' || value.id !== providerId || value.from?.id !== account.platform_account_id) throw createError({ statusCode: 502, statusMessage: 'Facebook returned an unverified post identity' })
    return { message: value.message || '' }
  }
  if (!(value === true || (value && typeof value === 'object' && value.success === true))) throw createError({ statusCode: 502, statusMessage: 'Facebook did not confirm the change' })
  return { message: message || '' }
}
