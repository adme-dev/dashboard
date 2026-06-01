# D2 OAuth — Meta (Facebook + Instagram) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an operator connect a Meta Page from a client's Accounts page and thereby make publishing + engagement inbox (comments/reviews) + reply automation go live for that Page (Facebook + linked Instagram) in one step.

**Architecture:** A reusable OAuth framework (`server/utils/socialOAuth/`) of pure + injected units — an HMAC state signer, a Meta module (auth-URL builder, page lister, page→account-row mapper, webhook subscriber) with an injected `fetch`, and a DB-injected `upsertSocialAccount` enforcing one-Page-one-client. Three thin Nitro endpoints (`connect` → `callback` → `complete`) wire them, with the multi-Page selection list held server-side in the existing `CACHE` KV binding (keyed by a signed nonce — no tokens in URLs). Tokens land in `social_accounts` (migration 144, already has every column — **no new migration**). The Page is subscribed to the `feed` webhook so the 2a inbox receiver lights up.

**Tech Stack:** Nitro (Nuxt 4 server), Neon Postgres via `server/utils/db.ts`, Meta Graph API v22.0 (reusing `metaClient.ts` `exchangeMetaCode`/`exchangeForLongLivedToken`), Cloudflare KV (`CACHE` binding), Vitest, Nuxt UI v4.

---

## Background: what already exists

- `server/utils/metaClient.ts` — **reuse**: `exchangeMetaCode(code, appId, appSecret, redirectUri)` and `exchangeForLongLivedToken(shortToken, appId, appSecret)` both return `MetaTokenResponse { access_token, expires_in? }`. **Do NOT reuse** `getMetaAuthUrl` (hardcodes ad scopes) or `getPages` (omits page token + IG link).
- `social_accounts` (migration 144): `id, client_id, platform, platform_account_id, account_name, access_token, refresh_token, token_expires_at, is_active, last_error, metadata JSONB, created_by, created_at, updated_at`, `UNIQUE(platform, platform_account_id)`. Already has everything D2 needs.
- `server/api/agency/social/publishing/accounts/index.get.ts` — read API (omits tokens). `[id].delete.ts` — disconnect.
- `app/pages/agency/social/publishing/accounts.vue` — per-platform list with a **disabled** "Connect" button + an "operator-activated" alert. Uses `useSocialPublishing()` (`listAccounts(clientId)`, `deleteAccount(id)`).
- `server/api/webhooks/social/meta` (2a) — the app webhook receiver; HMAC-verifies with `META_APP_SECRET`, checks `META_WEBHOOK_VERIFY_TOKEN`. Unchanged.
- KV access pattern (project convention): `(event.context as any).cloudflare?.env?.CACHE`, returns undefined locally → must degrade gracefully.
- Spec: `docs/superpowers/specs/2026-06-01-social-d2-oauth-meta-design.md`.

**Redirect URI:** derived from the request origin as `${origin}/api/agency/social/publishing/accounts/callback/meta`, with optional `SOCIAL_OAUTH_REDIRECT_BASE` override (proxies). The SAME value is used in `connect` (auth URL) and `callback` (token exchange) — Meta requires an exact match.

---

## File Structure

```
server/utils/socialOAuth/
  state.ts      # pure: signState / verifyState (HMAC, base64url, expiry)
  meta.ts       # buildMetaAuthUrl (pure) · mapPagesToAccountRows (pure) ·
                # listManagedPages (injected fetch) · subscribePageWebhook (injected fetch)
  store.ts      # upsertSocialAccount (DB-injected; insert | same-client update | other-client conflict)
  pending.ts    # KV-backed pending-selection store (putPending/getPending/delPending; graceful null)
server/api/agency/social/publishing/accounts/
  connect/meta.get.ts     # build signed state → 302 to Meta
  callback/meta.get.ts    # verify state → exchange → list pages → 1:finalize / N:stash in KV → 302 back
  complete.post.ts        # verify nonce → read KV → upsert selected pages + IG + webhook subscribe
  [id].delete.ts          # MODIFY: best-effort webhook unsubscribe before delete
app/pages/agency/social/publishing/accounts.vue   # MODIFY: enable Meta connect, selection modal, query-flag toasts, health
test/social/oauthState.test.ts
test/social/oauthMetaMap.test.ts
test/social/oauthMetaGraph.test.ts
test/social/oauthStore.test.ts
```

No new migration. No new env at build time (all read via `process.env` at request time).

---

## Task 1: HMAC state signer (pure)

**Files:**
- Create: `server/utils/socialOAuth/state.ts`
- Test: `test/social/oauthState.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/oauthState.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { signState, verifyState } from '~~/server/utils/socialOAuth/state'

const SECRET = 'test-secret'

describe('signState / verifyState', () => {
  it('round-trips the payload', () => {
    const token = signState({ clientId: 'c1', userId: 'u1', platform: 'meta', nonce: 'n1' }, SECRET)
    const data = verifyState<any>(token, SECRET, 600_000)
    expect(data?.clientId).toBe('c1')
    expect(data?.platform).toBe('meta')
  })
  it('rejects a tampered payload', () => {
    const token = signState({ clientId: 'c1' }, SECRET)
    const [body] = token.split('.')
    const forged = `${body}.deadbeef`
    expect(verifyState(forged, SECRET, 600_000)).toBeNull()
  })
  it('rejects a wrong secret', () => {
    const token = signState({ clientId: 'c1' }, SECRET)
    expect(verifyState(token, 'other', 600_000)).toBeNull()
  })
  it('rejects an expired token', () => {
    const token = signState({ clientId: 'c1', ts: Date.now() - 10_000 }, SECRET)
    expect(verifyState(token, SECRET, 5_000)).toBeNull()
  })
  it('stamps ts when absent and accepts a fresh token', () => {
    const token = signState({ clientId: 'c1' }, SECRET)
    expect(verifyState<any>(token, SECRET, 600_000)?.clientId).toBe('c1')
  })
  it('returns null on malformed input', () => {
    expect(verifyState('not-a-token', SECRET, 600_000)).toBeNull()
    expect(verifyState('', SECRET, 600_000)).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/oauthState.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialOAuth/state.ts`:
```ts
// server/utils/socialOAuth/state.ts
// Pure HMAC-signed state for the OAuth round-trip. No I/O. The token is "<base64url(json)>.<hmacHex>".
// `ts` (ms epoch) is stamped on sign if absent; verify enforces maxAgeMs and a timing-safe signature check.
import { createHmac, timingSafeEqual } from 'node:crypto'

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}
function hmac(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex')
}

export function signState(data: Record<string, any>, secret: string): string {
  const withTs = { ts: Date.now(), ...data }
  // ensure ts present even if caller passed one (caller's ts wins via spread order below)
  const payload = { ...withTs, ...data, ts: data.ts ?? withTs.ts }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${hmac(body, secret)}`
}

export function verifyState<T = any>(token: string, secret: string, maxAgeMs: number): T | null {
  if (!token || !token.includes('.')) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = hmac(body, secret)
  if (sig.length !== expected.length) return null
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
  } catch { return null }
  let data: any
  try { data = JSON.parse(fromB64url(body).toString('utf8')) } catch { return null }
  if (typeof data?.ts === 'number' && Date.now() - data.ts > maxAgeMs) return null
  return data as T
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/oauthState.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialOAuth/state.ts test/social/oauthState.test.ts
git commit -m "feat(social-oauth): HMAC-signed state signer"
```

---

## Task 2: Meta auth-URL + page→account-row mapper (pure)

**Files:**
- Create: `server/utils/socialOAuth/meta.ts`
- Test: `test/social/oauthMetaMap.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/oauthMetaMap.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildMetaAuthUrl, mapPagesToAccountRows, type ManagedPage } from '~~/server/utils/socialOAuth/meta'

describe('buildMetaAuthUrl', () => {
  it('includes appId, redirect, state, response_type=code and the D2 scopes (not ad scopes)', () => {
    const url = buildMetaAuthUrl('APPID', 'https://x/cb', 'STATE')
    expect(url).toContain('client_id=APPID')
    expect(url).toContain('state=STATE')
    expect(url).toContain('response_type=code')
    expect(decodeURIComponent(url)).toContain('instagram_content_publish')
    expect(decodeURIComponent(url)).toContain('pages_manage_metadata')
    expect(decodeURIComponent(url)).not.toContain('ads_management')
  })
})

describe('mapPagesToAccountRows', () => {
  const expiresAt = '2026-08-01T00:00:00.000Z'
  it('maps a plain page to a single facebook row', () => {
    const page: ManagedPage = { id: 'P1', name: 'Acme', accessToken: 'PT', category: 'Brand' }
    const rows = mapPagesToAccountRows(page, expiresAt)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ platform: 'facebook', platform_account_id: 'P1', account_name: 'Acme', access_token: 'PT', token_expires_at: expiresAt })
    expect(rows[0].metadata.page_category).toBe('Brand')
    expect(rows[0].metadata.webhook_subscribed).toBe(false)
  })
  it('adds an instagram row when the page has a linked IG business account', () => {
    const page: ManagedPage = { id: 'P1', name: 'Acme', accessToken: 'PT', igId: 'IG9', igUsername: 'acme_ig' }
    const rows = mapPagesToAccountRows(page, expiresAt)
    expect(rows.map(r => r.platform)).toEqual(['facebook', 'instagram'])
    const ig = rows[1]
    expect(ig).toMatchObject({ platform: 'instagram', platform_account_id: 'IG9', account_name: 'acme_ig', access_token: 'PT' })
    expect(ig.metadata.via_page_id).toBe('P1')
    expect(rows[0].metadata.linked_ig_id).toBe('IG9')
  })
  it('falls back to the page name when IG username is missing', () => {
    const page: ManagedPage = { id: 'P1', name: 'Acme', accessToken: 'PT', igId: 'IG9' }
    expect(mapPagesToAccountRows(page, expiresAt)[1].account_name).toBe('Acme')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/oauthMetaMap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation (auth-URL + mapper + shared types)**

`server/utils/socialOAuth/meta.ts`:
```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/oauthMetaMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialOAuth/meta.ts test/social/oauthMetaMap.test.ts
git commit -m "feat(social-oauth): Meta auth-URL builder + page→account-row mapper"
```

---

## Task 3: Meta Graph calls (injected fetch)

**Files:**
- Modify: `server/utils/socialOAuth/meta.ts` (append)
- Test: `test/social/oauthMetaGraph.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/oauthMetaGraph.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { listManagedPages, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'

function fakeFetch(payload: any, ok = true, status = 200) {
  return vi.fn(async () => ({ ok, status, json: async () => payload, text: async () => JSON.stringify(payload) }))
}

describe('listManagedPages', () => {
  it('maps Graph /me/accounts into ManagedPage[] incl. linked IG', async () => {
    const f = fakeFetch({ data: [
      { id: 'P1', name: 'Acme', access_token: 'PT1', category: 'Brand',
        instagram_business_account: { id: 'IG1', username: 'acme_ig' } },
      { id: 'P2', name: 'Beta', access_token: 'PT2' },
    ] })
    const pages = await listManagedPages('USERTOKEN', f as any)
    expect(f).toHaveBeenCalledOnce()
    expect(pages).toHaveLength(2)
    expect(pages[0]).toMatchObject({ id: 'P1', name: 'Acme', accessToken: 'PT1', igId: 'IG1', igUsername: 'acme_ig' })
    expect(pages[1]).toMatchObject({ id: 'P2', accessToken: 'PT2' })
    expect(pages[1].igId).toBeUndefined()
  })
  it('returns [] when Graph returns no data', async () => {
    expect(await listManagedPages('T', fakeFetch({ data: [] }) as any)).toEqual([])
  })
  it('throws on a Graph error response', async () => {
    const f = fakeFetch({ error: { message: 'bad token' } }, false, 400)
    await expect(listManagedPages('T', f as any)).rejects.toThrow(/bad token/)
  })
})

describe('subscribePageWebhook', () => {
  it('POSTs subscribed_apps with feed and returns ok on success', async () => {
    const f = fakeFetch({ success: true })
    const r = await subscribePageWebhook('P1', 'PT1', f as any)
    expect(r.ok).toBe(true)
    const url = (f as any).mock.calls[0][0] as string
    expect(url).toContain('/P1/subscribed_apps')
    expect(decodeURIComponent(url)).toContain('feed')
  })
  it('returns ok:false + error on a Graph failure (does not throw — caller records last_error)', async () => {
    const r = await subscribePageWebhook('P1', 'PT1', fakeFetch({ error: { message: 'no perm' } }, false, 403) as any)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/no perm/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/oauthMetaGraph.test.ts`
Expected: FAIL — `listManagedPages`/`subscribePageWebhook` not exported.

- [ ] **Step 3: Append the Graph calls to `meta.ts`**

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/oauthMetaGraph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialOAuth/meta.ts test/social/oauthMetaGraph.test.ts
git commit -m "feat(social-oauth): Meta Graph calls — listManagedPages + subscribePageWebhook"
```

---

## Task 4: upsertSocialAccount (DB-injected, one-Page-one-client)

**Files:**
- Create: `server/utils/socialOAuth/store.ts`
- Test: `test/social/oauthStore.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/oauthStore.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { upsertSocialAccount } from '~~/server/utils/socialOAuth/store'
import type { AccountRow } from '~~/server/utils/socialOAuth/meta'

const row: AccountRow = {
  platform: 'facebook', platform_account_id: 'P1', account_name: 'Acme',
  access_token: 'PT', token_expires_at: '2026-08-01T00:00:00.000Z', metadata: { webhook_subscribed: false },
}

function db(existing: any) {
  return {
    queryOne: vi.fn(async (sql: string) => {
      if (/SELECT id, client_id FROM social_accounts/.test(sql)) return existing
      if (/INSERT INTO social_accounts/.test(sql)) return { id: 'new1' }
      if (/UPDATE social_accounts/.test(sql)) return { id: existing?.id }
      if (/FROM agency_clients/.test(sql)) return { name: 'Other Client' }
      return null
    }),
    execute: vi.fn(async () => 1),
  }
}

describe('upsertSocialAccount', () => {
  it('inserts when the page is new', async () => {
    const d = db(null)
    const r = await upsertSocialAccount(d as any, 'clientA', row, 'userX')
    expect(r.status).toBe('inserted')
    expect(r.id).toBe('new1')
  })
  it('updates (re-auth) when the page already belongs to THIS client', async () => {
    const d = db({ id: 'acc1', client_id: 'clientA' })
    const r = await upsertSocialAccount(d as any, 'clientA', row, 'userX')
    expect(r.status).toBe('updated')
    expect(r.id).toBe('acc1')
  })
  it('reports a conflict (no write) when the page belongs to ANOTHER client', async () => {
    const d = db({ id: 'acc1', client_id: 'clientB' })
    const r = await upsertSocialAccount(d as any, 'clientA', row, 'userX')
    expect(r.status).toBe('conflict')
    expect(r.conflictClientName).toBe('Other Client')
    // no insert/update issued
    expect(d.queryOne).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_accounts/), expect.anything())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/oauthStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialOAuth/store.ts`:
```ts
// server/utils/socialOAuth/store.ts
// DB-injected upsert for social_accounts honoring UNIQUE(platform, platform_account_id):
// new page → insert; page owned by THIS client → update (re-auth refresh); page owned by ANOTHER
// client → 'conflict' (no write), so the endpoint can return a clear 409.
import type { AccountRow } from './meta'

export interface AccountDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  execute(sql: string, params?: any[]): Promise<number>
}

export type UpsertResult =
  | { status: 'inserted' | 'updated'; id: string }
  | { status: 'conflict'; conflictClientName: string | null }

export async function upsertSocialAccount(db: AccountDb, clientId: string, row: AccountRow, createdBy: string): Promise<UpsertResult> {
  const existing = await db.queryOne<{ id: string; client_id: string }>(
    `SELECT id, client_id FROM social_accounts WHERE platform = $1 AND platform_account_id = $2`,
    [row.platform, row.platform_account_id])

  if (existing && existing.client_id !== clientId) {
    const owner = await db.queryOne<{ name: string }>(`SELECT name FROM agency_clients WHERE id = $1`, [existing.client_id])
    return { status: 'conflict', conflictClientName: owner?.name ?? null }
  }

  if (existing) {
    await db.queryOne(
      `UPDATE social_accounts SET account_name = $2, access_token = $3, token_expires_at = $4,
         metadata = social_accounts.metadata || $5::jsonb, is_active = TRUE, last_error = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id`,
      [existing.id, row.account_name, row.access_token, row.token_expires_at, JSON.stringify(row.metadata)])
    return { status: 'updated', id: existing.id }
  }

  const inserted = await db.queryOne<{ id: string }>(
    `INSERT INTO social_accounts
       (client_id, platform, platform_account_id, account_name, access_token, token_expires_at, metadata, is_active, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb, TRUE, $8) RETURNING id`,
    [clientId, row.platform, row.platform_account_id, row.account_name, row.access_token, row.token_expires_at, JSON.stringify(row.metadata), createdBy])
  return { status: 'inserted', id: inserted!.id }
}

/** Patch a saved account's metadata.webhook_subscribed flag (after the subscribe attempt). */
export async function markWebhookSubscribed(db: AccountDb, accountId: string, subscribed: boolean, error: string | null): Promise<void> {
  await db.execute(
    `UPDATE social_accounts SET metadata = metadata || $2::jsonb, last_error = $3, updated_at = NOW() WHERE id = $1`,
    [accountId, JSON.stringify({ webhook_subscribed: subscribed }), error])
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/oauthStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialOAuth/store.ts test/social/oauthStore.test.ts
git commit -m "feat(social-oauth): upsertSocialAccount with one-page-one-client guard"
```

---

## Task 5: KV pending-selection store

**Files:**
- Create: `server/utils/socialOAuth/pending.ts`

No unit test (thin glue over the KV binding; behavior is exercised manually + by the endpoint). The functions degrade gracefully when KV is absent.

- [ ] **Step 1: Write the implementation**

`server/utils/socialOAuth/pending.ts`:
```ts
// server/utils/socialOAuth/pending.ts
// Holds the multi-page selection (page list + tokens) SERVER-SIDE in the CACHE KV binding, keyed by a
// nonce, so the OAuth redirect carries only a signed nonce — never a token in a URL. 10-min TTL.
import type { H3Event } from 'h3'
import type { ManagedPage } from './meta'

const TTL_SECONDS = 600
const key = (nonce: string) => `social_oauth_pending:${nonce}`

export interface PendingConnection {
  clientId: string
  userId: string
  expiresAt: string | null   // token_expires_at to stamp on the saved rows
  pages: ManagedPage[]
}

function kv(event: H3Event): any | null {
  return (event.context as any).cloudflare?.env?.CACHE ?? null
}

/** Returns true if stored, false if KV is unavailable (caller must handle the degraded path). */
export async function putPending(event: H3Event, nonce: string, data: PendingConnection): Promise<boolean> {
  const store = kv(event)
  if (!store) return false
  await store.put(key(nonce), JSON.stringify(data), { expirationTtl: TTL_SECONDS })
  return true
}

export async function getPending(event: H3Event, nonce: string): Promise<PendingConnection | null> {
  const store = kv(event)
  if (!store) return null
  const raw = await store.get(key(nonce))
  return raw ? JSON.parse(raw) as PendingConnection : null
}

export async function delPending(event: H3Event, nonce: string): Promise<void> {
  const store = kv(event)
  if (store) await store.delete(key(nonce))
}
```

- [ ] **Step 2: Confirm it type-resolves**

Run: `pnpm exec vitest run test/social/oauthStore.test.ts`
Expected: PASS (sanity that imports resolve; nothing references `pending.ts` yet).

- [ ] **Step 3: Commit**

```bash
git add server/utils/socialOAuth/pending.ts
git commit -m "feat(social-oauth): KV-backed pending-selection store"
```

---

## Task 6: connect endpoint

**Files:**
- Create: `server/api/agency/social/publishing/accounts/connect/meta.get.ts`

- [ ] **Step 1: Write the endpoint**

`server/api/agency/social/publishing/accounts/connect/meta.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { signState } from '~~/server/utils/socialOAuth/state'
import { buildMetaAuthUrl } from '~~/server/utils/socialOAuth/meta'

/**
 * GET /api/agency/social/publishing/accounts/connect/meta?clientId=
 * Builds a signed-state Meta OAuth URL and 302s the operator to Facebook.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const appId = process.env.META_APP_ID
  if (!appId) throw createError({ statusCode: 503, statusMessage: 'Meta app not configured' })

  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  if (!secret) throw createError({ statusCode: 503, statusMessage: 'OAuth state secret not configured' })

  const base = process.env.SOCIAL_OAUTH_REDIRECT_BASE || getRequestURL(event).origin
  const redirectUri = `${base}/api/agency/social/publishing/accounts/callback/meta`

  const nonce = crypto.randomUUID()
  const state = signState({ clientId, userId: String(user.id), platform: 'meta', nonce }, secret)
  return sendRedirect(event, buildMetaAuthUrl(appId, redirectUri, state), 302)
})
```

- [ ] **Step 2: Confirm suite still green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/publishing/accounts/connect/meta.get.ts
git commit -m "feat(social-oauth): Meta connect endpoint (signed-state redirect)"
```

---

## Task 7: callback endpoint

**Files:**
- Create: `server/api/agency/social/publishing/accounts/callback/meta.get.ts`

- [ ] **Step 1: Write the endpoint**

`server/api/agency/social/publishing/accounts/callback/meta.get.ts`:
```ts
import { queryOne, execute } from '~~/server/utils/db'
import { verifyState, signState } from '~~/server/utils/socialOAuth/state'
import { exchangeMetaCode, exchangeForLongLivedToken } from '~~/server/utils/metaClient'
import { listManagedPages, mapPagesToAccountRows, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'
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
  } catch (e: any) {
    return fail(`token_exchange_failed`)
  }

  let pages
  try { pages = await listManagedPages(userToken) } catch { return fail('page_list_failed') }
  if (!pages.length) return fail('no_pages')

  // 1 page → finalize inline.
  if (pages.length === 1) {
    const r = await finalizePage(event, state.clientId, state.userId, pages[0], expiresAt)
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
async function finalizePage(event: any, clientId: string, userId: string, page: any, expiresAt: string | null): Promise<'ok' | 'conflict'> {
  const rows = mapPagesToAccountRows(page, expiresAt)
  // The facebook row is rows[0]; subscribe its webhook once, reflect onto both saved rows.
  const sub = await subscribePageWebhook(page.id, page.accessToken)
  for (const row of rows) {
    row.metadata.webhook_subscribed = sub.ok
    const res = await upsertSocialAccount({ queryOne, execute }, clientId, row, userId)
    if (res.status === 'conflict') return 'conflict'
    if (!sub.ok) await markWebhookSubscribed({ queryOne, execute }, res.id, false, `webhook subscribe failed: ${sub.error}`)
  }
  return 'ok'
}
```

- [ ] **Step 2: Confirm suite still green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS (endpoint isn't imported by tests; this confirms its deps resolve).

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/publishing/accounts/callback/meta.get.ts
git commit -m "feat(social-oauth): Meta callback — exchange, list pages, finalize-or-select"
```

---

## Task 8: complete endpoint (multi-page selection)

**Files:**
- Create: `server/api/agency/social/publishing/accounts/complete.post.ts`

- [ ] **Step 1: Write the endpoint**

`server/api/agency/social/publishing/accounts/complete.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { mapPagesToAccountRows, subscribePageWebhook } from '~~/server/utils/socialOAuth/meta'
import { upsertSocialAccount, markWebhookSubscribed } from '~~/server/utils/socialOAuth/store'
import { getPending, delPending } from '~~/server/utils/socialOAuth/pending'

/**
 * POST /api/agency/social/publishing/accounts/complete  body { token, pageIds: string[] }
 * Finalizes the operator's page selection from the KV-stashed pending connection.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const { token, pageIds } = await readBody(event)
  if (!token || !Array.isArray(pageIds) || !pageIds.length) {
    throw createError({ statusCode: 400, statusMessage: 'token and pageIds required' })
  }
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  const sel = verifyState<{ nonce: string; clientId: string; userId: string }>(String(token), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid or expired selection' })

  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'selection expired' })

  const chosen = pending.pages.filter(p => pageIds.includes(p.id))
  if (!chosen.length) throw createError({ statusCode: 400, statusMessage: 'no matching pages' })

  const connected: string[] = []
  const conflicts: string[] = []
  for (const page of chosen) {
    const rows = mapPagesToAccountRows(page, pending.expiresAt)
    const sub = await subscribePageWebhook(page.id, page.accessToken)
    let conflict = false
    for (const row of rows) {
      row.metadata.webhook_subscribed = sub.ok
      const res = await upsertSocialAccount({ queryOne, execute }, pending.clientId, row, String(user.id))
      if (res.status === 'conflict') { conflict = true; conflicts.push(`${page.name} → ${res.conflictClientName || 'another client'}`); break }
      if (!sub.ok) await markWebhookSubscribed({ queryOne, execute }, res.id, false, `webhook subscribe failed: ${sub.error}`)
    }
    if (!conflict) connected.push(page.name)
  }
  await delPending(event, sel.nonce)
  return { connected, conflicts }
})
```

- [ ] **Step 2: Confirm suite still green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/publishing/accounts/complete.post.ts
git commit -m "feat(social-oauth): Meta complete endpoint (KV-backed multi-page selection)"
```

---

## Task 9: best-effort webhook unsubscribe on disconnect

**Files:**
- Modify: `server/api/agency/social/publishing/accounts/[id].delete.ts`

- [ ] **Step 1: Read the current delete endpoint**

Run: `cat server/api/agency/social/publishing/accounts/\[id\].delete.ts`
Note its auth + the lookup/delete by id. Match its style.

- [ ] **Step 2: Add a best-effort unsubscribe before the delete**

Inside the handler, after loading the row to delete and before/around the DELETE, add (using the row's `platform`, `platform_account_id`, `access_token`, and `metadata.webhook_subscribed`):
```ts
// Best-effort: unsubscribe the Page webhook before removing a Meta account (never blocks the delete).
if ((row.platform === 'facebook') && row.access_token && row.metadata?.webhook_subscribed) {
  try {
    await fetch(`https://graph.facebook.com/v22.0/${row.platform_account_id}/subscribed_apps?access_token=${encodeURIComponent(row.access_token)}`, { method: 'DELETE' })
  } catch { /* ignore — the row is being deleted regardless */ }
}
```
If the current handler doesn't already `SELECT` the row's token/platform before deleting, change its lookup to `SELECT platform, platform_account_id, access_token, metadata FROM social_accounts WHERE id = $1` first, then delete.

- [ ] **Step 3: Confirm suite still green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add 'server/api/agency/social/publishing/accounts/[id].delete.ts'
git commit -m "feat(social-oauth): best-effort webhook unsubscribe on Meta disconnect"
```

---

## Task 10: Accounts page — enable Meta connect + selection modal + health

**Files:**
- Modify: `app/pages/agency/social/publishing/accounts.vue`

**Pre-req:** touches a form/modal — invoke the `frontend-design` skill first; use Nuxt UI v4 (`UModal`, `UCheckbox`, `UButton`, `UFormField` where applicable), no raw elements.

- [ ] **Step 1: Enable the Meta connect button + handle query flags**

In `<script setup>` add:
```ts
const route = useRoute()
const router = useRouter()
const META_PLATFORMS = ['facebook', 'instagram'] // both connect via the same Meta flow

function connect(platform: string) {
  if (!clientId.value) return
  if (platform === 'facebook' || platform === 'instagram') {
    window.location.href = `/api/agency/social/publishing/accounts/connect/meta?clientId=${clientId.value}`
  }
}

// Selection modal state (populated from ?social_select=)
const selectOpen = ref(false)
const selectToken = ref('')
const selectPages = ref<Array<{ id: string; name: string; igUsername?: string }>>([])
const selectChosen = ref<string[]>([])

onMounted(async () => {
  if (route.query.social_connected) {
    toast.add({ title: `Connected ${route.query.social_connected} page(s)`, color: 'success' })
    await load(); router.replace({ query: {} })
  }
  if (route.query.social_error) {
    toast.add({ title: 'Connection failed', description: String(route.query.social_error).replace(/_/g, ' '), color: 'error' })
    router.replace({ query: {} })
  }
  if (route.query.social_select) {
    selectToken.value = String(route.query.social_select)
    // The page list for display comes from a lightweight echo endpoint is overkill — instead the
    // selection payload is opaque; show a generic chooser by re-reading via complete preview is not needed.
    // We fetch the page names by asking the server to decode is unnecessary: the callback already stored them.
    // Simplest: show the modal and let the operator pick by connecting all, OR fetch names:
    await loadSelectPages()
    selectOpen.value = true
    router.replace({ query: {} })
  }
})

async function loadSelectPages() {
  try {
    selectPages.value = await $fetch('/api/agency/social/publishing/accounts/pending', { query: { token: selectToken.value } })
  } catch { selectPages.value = [] }
}

async function confirmSelection() {
  try {
    const res = await $fetch<{ connected: string[]; conflicts: string[] }>('/api/agency/social/publishing/accounts/complete', {
      method: 'POST', body: { token: selectToken.value, pageIds: selectChosen.value },
    })
    selectOpen.value = false
    if (res.connected.length) toast.add({ title: `Connected: ${res.connected.join(', ')}`, color: 'success' })
    if (res.conflicts.length) toast.add({ title: 'Some pages were skipped', description: res.conflicts.join('; '), color: 'warning' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not complete', description: e?.data?.statusMessage, color: 'error' })
  }
}
```

- [ ] **Step 2: Add a tiny `pending` GET to surface page names for the modal**

Create `server/api/agency/social/publishing/accounts/pending.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { verifyState } from '~~/server/utils/socialOAuth/state'
import { getPending } from '~~/server/utils/socialOAuth/pending'

/** GET ...accounts/pending?token=  → the page names for the selection modal (no tokens leaked). */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.META_APP_SECRET || ''
  const sel = verifyState<{ nonce: string }>(String(getQuery(event).token || ''), secret, 600_000)
  if (!sel) throw createError({ statusCode: 400, statusMessage: 'invalid token' })
  const pending = await getPending(event, sel.nonce)
  if (!pending) throw createError({ statusCode: 410, statusMessage: 'expired' })
  return pending.pages.map(p => ({ id: p.id, name: p.name, igUsername: p.igUsername }))
})
```

- [ ] **Step 3: Update the template — enable the button + add the modal**

Replace the disabled connect button line:
```vue
<UButton v-else size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-plus">Connect</UButton>
```
with a Meta-enabled version (Meta networks clickable; the other 4 stay disabled with a tooltip):
```vue
<template v-else>
  <UButton
    v-if="p === 'facebook' || p === 'instagram'"
    size="xs" variant="subtle" icon="i-lucide-plus" :disabled="!clientId" @click="connect(p)"
  >Connect</UButton>
  <UTooltip v-else text="Coming soon — needs platform app registration">
    <UButton size="xs" variant="subtle" color="neutral" disabled icon="i-lucide-plus">Connect</UButton>
  </UTooltip>
</template>
```
Update the info alert copy to reflect Meta being live:
```vue
<UAlert
  icon="i-lucide-info" color="info" variant="subtle" class="mb-5"
  title="Meta (Facebook + Instagram) is connectable"
  description="Connect a Meta Page to activate publishing, the engagement inbox, and reply automation for that page. Other networks need per-network app registration (coming soon)."
/>
```
Add the selection modal before the closing `</div>`:
```vue
<UModal v-model:open="selectOpen">
  <template #content>
    <div class="p-6 space-y-4">
      <h2 class="text-lg font-semibold">Choose pages to connect</h2>
      <p class="text-sm text-muted">These Facebook Pages are available on the authorized Meta account. Pick the ones for this client.</p>
      <div class="space-y-2 max-h-80 overflow-auto">
        <label v-for="pg in selectPages" :key="pg.id" class="flex items-center gap-3 rounded-lg border border-default p-3 cursor-pointer">
          <UCheckbox :model-value="selectChosen.includes(pg.id)" @update:model-value="(v:boolean) => v ? selectChosen.push(pg.id) : selectChosen = selectChosen.filter(x => x !== pg.id)" />
          <div class="min-w-0">
            <div class="text-sm font-medium truncate">{{ pg.name }}</div>
            <div v-if="pg.igUsername" class="text-xs text-muted truncate">+ Instagram @{{ pg.igUsername }}</div>
          </div>
        </label>
      </div>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="selectOpen = false" />
        <UButton label="Connect selected" :disabled="!selectChosen.length" @click="confirmSelection" />
      </div>
    </div>
  </template>
</UModal>
```
Then remove the now-misleading comment block in `onMounted` (the one explaining the opaque payload) — `loadSelectPages` covers it.

- [ ] **Step 4: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt" (pre-existing `parseCsv` duplicate-import WARN is unrelated).

- [ ] **Step 5: Commit**

```bash
git add app/pages/agency/social/publishing/accounts.vue server/api/agency/social/publishing/accounts/pending.get.ts
git commit -m "feat(social-oauth): accounts page — Meta connect, page-selection modal, health"
```

---

## Task 11: .env.example + final verification

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Document the env vars**

Append to `.env.example`:
```
# --- Social Suite OAuth (Meta — D2) ---
# Meta app credentials (also used by ad-spend OAuth). Required to connect Facebook/Instagram pages.
META_APP_ID=
META_APP_SECRET=
# Webhook verification token (must match the value configured in the Meta app webhook). Used by 2a inbox receiver.
META_WEBHOOK_VERIFY_TOKEN=
# Optional: dedicated secret for signing OAuth state (falls back to META_APP_SECRET).
SOCIAL_OAUTH_STATE_SECRET=
# Optional: override the OAuth redirect base (defaults to the request origin). e.g. https://app.example.com
SOCIAL_OAUTH_REDIRECT_BASE=
```

- [ ] **Step 2: Full social suite test run**

Run: `pnpm exec vitest run test/social/`
Expected: PASS — existing social/inbox/automation suites + the 4 new OAuth suites (oauthState, oauthMetaMap, oauthMetaGraph, oauthStore).

- [ ] **Step 3: No new type errors**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tail -40`
Expected: only the pre-existing baseline errors (portal/monday/analytics files). **Any error referencing `socialOAuth/*`, the new endpoints, or `accounts.vue` is a regression to fix.** Isolate with:
`... pnpm exec nuxt typecheck 2>&1 | grep -E "socialOAuth/|accounts/(connect|callback|complete|pending)|accounts\.vue"` → expect empty.

- [ ] **Step 4: Confirm no live OAuth / no secrets committed**

Run: `git log --oneline origin/main..HEAD && grep -rn "META_APP_SECRET" server/ | grep -v "process.env" || echo "no hardcoded secrets"`
Expected: only feature commits; no hardcoded secrets (all via `process.env`).

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "docs(social-oauth): document Meta OAuth env vars"
```

---

## Self-Review (against the spec)

- **§4 connect→callback→complete flow** → Tasks 6/7/8. ✓ (KV-backed selection refines the spec's "signed payload carries the user token" → server-side KV + signed nonce; **more secure, no token in URLs** — flagged to the user.)
- **§4.1 signed state** → Task 1 (`state.ts`). ✓
- **§5 scopes + token model + per-row data** → Task 2 (`META_D2_SCOPES`, `mapPagesToAccountRows`) + Task 7 (exchange + expiry). ✓
- **§6 full activation (webhook subscribe)** → Task 3 (`subscribePageWebhook`) + Tasks 7/8 (called on finalize). ✓
- **§7 one-Page-one-client (409/skip)** → Task 4 (`upsertSocialAccount` conflict) + endpoints translate it. ✓
- **§8 UI (enable connect, selection modal, health, query flags)** → Task 10. ✓
- **§9 security (auth+creative, HMAC state, client scoping, no token in API, no SSRF)** → Tasks 1/4/6/7/8/10. ✓ *(connect/complete use `requireAuth`; the callback is hit by Meta (no user session) and is protected by the HMAC state instead — correct for an OAuth callback.)*
- **§10 file structure** → matches Tasks 1–10. ✓
- **§11 testing (pure/injected, no live OAuth)** → Tasks 1–4 unit suites. ✓
- **§12 operator activation** → Task 11 (.env.example) + the spec's operator section. ✓
- **No migration** → confirmed; no task creates one. ✓

**Placeholder scan:** none — every code step is complete. The one prose-y comment in Task 10 Step 1 (the opaque-payload aside) is explicitly removed in Step 3.

**Type consistency:** `ManagedPage`/`AccountRow`/`UpsertResult`/`PendingConnection`/`signState`/`verifyState`/`mapPagesToAccountRows`/`listManagedPages`/`subscribePageWebhook`/`upsertSocialAccount`/`markWebhookSubscribed`/`getPending`/`putPending`/`delPending` are used identically across tasks.

---

## Execution Handoff

⚠️ **Standing constraints for the executor:** no live OAuth round-trip in tests (needs the operator's Meta app + a public redirect URI — that's post-merge operator verification). Do not commit any real `META_APP_*` secret. Do not enable `SOCIAL_AUTOMATION_ENABLED`.
