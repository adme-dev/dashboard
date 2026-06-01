import { queryOne, execute } from '~~/server/utils/db'
import { verifyState, signState } from '~~/server/utils/socialOAuth/state'
import { exchangeMetaCode, exchangeForLongLivedToken } from '~~/server/utils/metaClient'
import { listManagedPages, mapPagesToAccountRows, subscribePageWebhook, type ManagedPage } from '~~/server/utils/socialOAuth/meta'
import { upsertSocialAccount, markWebhookSubscribed } from '~~/server/utils/socialOAuth/store'
import { putPending } from '~~/server/utils/socialOAuth/pending'

const ACCOUNTS_PATH = '/agency/social/publishing/accounts'

/**
 * GET /api/agency/social/publishing/accounts/callback/meta?code&state
 * Meta redirects here. Verifies state, exchanges the code for a long-lived user token, lists managed
 * Pages, then: 0 pages → error; 1 page → finalize inline; >1 → stash in KV and bounce to the selection UI.
 */
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  const appId = process.env.META_APP_ID || ''
  const appSecret = process.env.META_APP_SECRET || ''
  const base = process.env.SOCIAL_OAUTH_REDIRECT_BASE || getRequestURL(event).origin
  const redirectUri = `${base}/api/agency/social/publishing/accounts/callback/meta`
  const fail = (reason: string) => sendRedirect(event, `${ACCOUNTS_PATH}?social_error=${encodeURIComponent(reason)}`, 302)

  if (q.error) return fail(String(q.error_description || q.error))
  const state = verifyState<{ clientId: string; userId: string }>(String(q.state || ''), secret, 600_000)
  if (!state) return fail('invalid_state')
  if (!q.code) return fail('no_code')

  let userToken: string
  let expiresAt: string | null = null
  try {
    const short = await exchangeMetaCode(String(q.code), appId, appSecret, redirectUri)
    const long = await exchangeForLongLivedToken(short.access_token, appId, appSecret)
    userToken = long.access_token
    if (long.expires_in) expiresAt = new Date(Date.now() + long.expires_in * 1000).toISOString()
  } catch {
    return fail('token_exchange_failed')
  }

  let pages: ManagedPage[]
  try { pages = await listManagedPages(userToken) } catch { return fail('page_list_failed') }
  if (!pages.length) return fail('no_pages')

  // 1 page → finalize inline.
  if (pages.length === 1) {
    const r = await finalizePage(state.clientId, state.userId, pages[0], expiresAt)
    if (r === 'conflict') return fail('page_owned_by_another_client')
    return sendRedirect(event, `${ACCOUNTS_PATH}?social_connected=1`, 302)
  }

  // >1 page → stash server-side, bounce to the selection UI with only a signed nonce.
  const nonce = crypto.randomUUID()
  const stored = await putPending(event, nonce, { clientId: state.clientId, userId: state.userId, expiresAt, pages })
  if (!stored) return fail('selection_unavailable') // KV missing (e.g. local dev) — operator retries in prod
  const sel = signState({ nonce, clientId: state.clientId, userId: state.userId }, secret)
  return sendRedirect(event, `${ACCOUNTS_PATH}?social_select=${encodeURIComponent(sel)}`, 302)
})

/** Upsert a page (+IG) and subscribe its webhook. Returns 'conflict' if owned by another client. */
async function finalizePage(clientId: string, userId: string, page: ManagedPage, expiresAt: string | null): Promise<'ok' | 'conflict'> {
  const rows = mapPagesToAccountRows(page, expiresAt)
  const sub = await subscribePageWebhook(page.id, page.accessToken)
  for (const row of rows) {
    row.metadata.webhook_subscribed = sub.ok
    const res = await upsertSocialAccount({ queryOne, execute }, clientId, row, userId)
    if (res.status === 'conflict') return 'conflict'
    if (!sub.ok) await markWebhookSubscribed({ queryOne, execute }, res.id, false, `webhook subscribe failed: ${sub.error}`)
  }
  return 'ok'
}
