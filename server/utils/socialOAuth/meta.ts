// server/utils/socialOAuth/meta.ts
// Meta (Facebook + Instagram) OAuth helpers for the publishing/inbox connection (social_accounts).
// Pure functions (buildMetaAuthUrl, mapPagesToAccountRows) + injected-fetch Graph calls
// (listManagedPages, subscribePageWebhook) so everything is unit-testable.
import type { AccountRow } from './store'

const GRAPH = 'https://graph.facebook.com/v22.0'

// Page + IG comment/publish/insights scopes — all standard (NO App Review; App Review is DMs/mentions,
// Slice 2d). FB post/page insights ride `pages_read_engagement` (already present); IG insights need
// `instagram_manage_insights` (added for Slice 3 reporting → operators reconnect once to collect).
export const META_D2_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement',
  'pages_manage_metadata', 'instagram_basic', 'instagram_content_publish',
  'instagram_manage_comments', 'instagram_manage_insights',
  'business_management',
]

// Slice 2d messaging scopes — gated behind Meta App Review. NEVER added to the live OAuth request
// until the app is approved (an unapproved scope can break the consent dialog that publishing +
// comments rely on today). The operator flips SOCIAL_DM_ENABLED post-approval and reconnects.
export const META_MESSAGING_SCOPES = [
  'pages_messaging', 'instagram_manage_messages',
]

/** True only when the operator has explicitly enabled the App-Review-gated DM/mention channels. */
export function isSocialDmEnabled(): boolean {
  return process.env.SOCIAL_DM_ENABLED === 'true'
}

/** Scopes to request at connect: the base set, plus messaging only when DM channels are enabled. */
export function metaScopeSet(includeMessaging = false): string {
  return (includeMessaging ? [...META_D2_SCOPES, ...META_MESSAGING_SCOPES] : META_D2_SCOPES).join(',')
}

/** Webhook fields to subscribe a Page to: comments always; mentions + DMs only when enabled. */
export function metaSubscribedFields(includeMessaging = false): string {
  return includeMessaging ? 'feed,mention,messages' : 'feed'
}

export function buildMetaAuthUrl(appId: string, redirectUri: string, state: string, includeMessaging = false): string {
  const params = new URLSearchParams({
    client_id: appId, redirect_uri: redirectUri, state, scope: metaScopeSet(includeMessaging), response_type: 'code',
  })
  return `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`
}

export interface ManagedPage {
  id: string
  name: string
  accessToken: string
  category?: string
  igId?: string
  igUsername?: string
}

/** Pure: a managed Page → its social_accounts rows (a facebook row, plus an instagram row if linked). */
export function mapPagesToAccountRows(page: ManagedPage, expiresAt: string | null): AccountRow[] {
  const rows: AccountRow[] = [{
    platform: 'facebook',
    platform_account_id: page.id,
    account_name: page.name,
    access_token: page.accessToken,
    token_expires_at: expiresAt,
    metadata: { webhook_subscribed: false, page_category: page.category ?? null, linked_ig_id: page.igId ?? null },
  }]
  if (page.igId) {
    rows.push({
      platform: 'instagram',
      platform_account_id: page.igId,
      account_name: page.igUsername || page.name,
      access_token: page.accessToken,
      token_expires_at: expiresAt,
      metadata: { webhook_subscribed: false, via_page_id: page.id },
    })
  }
  return rows
}

type FetchLike = (url: string, init?: any) => Promise<{ ok: boolean; status: number; json: () => Promise<any>; text: () => Promise<string> }>

async function graphJson(f: FetchLike, url: string, init?: any): Promise<any> {
  const res = await f(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    throw new Error(`Meta Graph ${res.status}: ${data?.error?.message || 'request failed'}`)
  }
  return data
}

/** GET /me/accounts with page tokens + linked IG. Returns the managed Pages. */
export async function listManagedPages(userToken: string, f: FetchLike = fetch as any): Promise<ManagedPage[]> {
  const fields = 'id,name,access_token,category,instagram_business_account{id,username}'
  const url = `${GRAPH}/me/accounts?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(userToken)}`
  const data = await graphJson(f, url)
  return (data.data || []).map((p: any): ManagedPage => ({
    id: p.id, name: p.name, accessToken: p.access_token, category: p.category,
    igId: p.instagram_business_account?.id, igUsername: p.instagram_business_account?.username,
  }))
}

/**
 * Subscribe the Page to webhook fields so engagement pushes to /api/webhooks/social/meta. Non-throwing.
 * `fields` defaults to the env-derived set: `feed` (comments) always, plus `mention,messages` only
 * when the App-Review-gated DM channels are enabled (SOCIAL_DM_ENABLED).
 */
export async function subscribePageWebhook(
  pageId: string, pageToken: string, f: FetchLike = fetch as any,
  fields: string = metaSubscribedFields(isSocialDmEnabled()),
): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${GRAPH}/${pageId}/subscribed_apps?subscribed_fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(pageToken)}`
    await graphJson(f, url, { method: 'POST' })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
