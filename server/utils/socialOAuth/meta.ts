// server/utils/socialOAuth/meta.ts
// Meta (Facebook + Instagram) OAuth helpers for the publishing/inbox connection (social_accounts).
// Pure functions (buildMetaAuthUrl, mapPagesToAccountRows) + injected-fetch Graph calls
// (listManagedPages, subscribePageWebhook) so everything is unit-testable.

const GRAPH = 'https://graph.facebook.com/v22.0'

// Page + IG comment/publish scopes — comments/reviews need NO App Review (App Review is DMs/mentions, Slice 2d).
export const META_D2_SCOPES = [
  'pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_engagement',
  'pages_manage_metadata', 'instagram_basic', 'instagram_content_publish', 'instagram_manage_comments',
  'business_management',
].join(',')

export function buildMetaAuthUrl(appId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: appId, redirect_uri: redirectUri, state, scope: META_D2_SCOPES, response_type: 'code',
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

export interface AccountRow {
  platform: 'facebook' | 'instagram'
  platform_account_id: string
  account_name: string
  access_token: string
  token_expires_at: string | null
  metadata: Record<string, any>
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

/** Subscribe the Page to the `feed` webhook field so comments push to /api/webhooks/social/meta. Non-throwing. */
export async function subscribePageWebhook(pageId: string, pageToken: string, f: FetchLike = fetch as any): Promise<{ ok: boolean; error?: string }> {
  try {
    const url = `${GRAPH}/${pageId}/subscribed_apps?subscribed_fields=${encodeURIComponent('feed')}&access_token=${encodeURIComponent(pageToken)}`
    await graphJson(f, url, { method: 'POST' })
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) }
  }
}
