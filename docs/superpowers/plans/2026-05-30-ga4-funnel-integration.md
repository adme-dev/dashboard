# GA4 Funnel Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google Analytics 4 as its own website-analytics domain and surface a channel-level funnel (ad spend → sessions → GA4 key events → owned leads) in the client portal report.

**Architecture:** GA4 is stored in dedicated tables (`ga4_property_map`, `ga4_daily_channel`) — never in `media_spend`. OAuth reuses the existing Google token machinery via a separate `platform='ga4'` row in `social_connections` (one row per Google login). A `ga4_property_map` table maps each GA4 property to one client. A daily sync pulls per-channel metrics via the GA4 Data API. A funnel endpoint joins spend + GA4 + leads at GA4-channel grain and feeds a new "Website & Funnel" portal section.

**Tech Stack:** Nuxt 4 / Nitro (h3 event handlers), Neon Postgres (`server/utils/db.ts`), `ofetch`, GA4 Data API v1beta + Admin API v1beta, Vitest, Nuxt UI v4, Unovis.

---

## Spec refinement (read first)

The approved spec (`docs/superpowers/specs/2026-05-30-ga4-funnel-integration-design.md`) put `property_id`/`client_id` in `social_connections.metadata`. This plan refines that to a dedicated **`ga4_property_map`** table. Reason: one agency Google login commonly has access to *many* client GA4 properties, so a 1-login→N-properties→N-clients mapping is the correct shape and avoids cramming a list into JSONB. Connection rows hold only auth; the map table holds property→client. The GA4 OAuth scope also adds `openid email` so the callback can key the connection row by stable Google account id. Everything else matches the spec.

## File structure

**Create (backend):**
- `server/database/migrations/121-ga4-funnel.sql` — both new tables.
- `server/utils/channelMap.ts` — platform/source → GA4 channel (pure, tested).
- `server/utils/ga4Client.ts` — auth URL, property listing, runReport + parser (parser tested).
- `server/utils/ga4Sync.ts` — sync orchestration.
- `server/utils/ga4Funnel.ts` — funnel merge math (pure, tested).
- `server/api/agency/social/ga4/connect.get.ts`
- `server/api/agency/social/ga4/callback.get.ts`
- `server/api/agency/social/ga4/properties.get.ts`
- `server/api/agency/social/ga4/map.post.ts`
- `server/api/agency/social/ga4/sync.post.ts`
- `server/api/cron/ga4-sync.post.ts`
- `server/api/portal/analytics/funnel.get.ts`
- `server/api/agency/analytics/funnel.get.ts`

**Create (frontend):**
- `app/components/portal/FunnelChart.client.vue` — funnel + channel table.
- `app/components/social/Ga4ConnectCard.vue` — connect button + property→client picker.

**Modify:**
- `nuxt.config.ts` — add `ga4RedirectUri` runtime config.
- `app/pages/agency/social/index.vue` — render `<SocialGa4ConnectCard />`.
- `app/pages/portal/analytics/index.vue` — render `<PortalFunnelChart />` section.
- `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue` — marketing sync.

**Create (tests):**
- `test/utils/channelMap.test.ts`
- `test/utils/ga4Client.test.ts`
- `test/utils/ga4Funnel.test.ts`

---

## Task 1: Migration — GA4 tables

**Files:**
- Create: `server/database/migrations/121-ga4-funnel.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 121-ga4-funnel.sql
-- GA4 website-analytics domain: property→client mapping + daily channel metrics.
-- GA4 is NOT ad spend — it must never be stored in media_spend.

-- One row per GA4 property, mapped to exactly one client. The Google login /
-- tokens live in social_connections (platform='ga4'); this table is the
-- property→client routing layer.
CREATE TABLE IF NOT EXISTS ga4_property_map (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id         UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  property_id           TEXT NOT NULL,
  property_display_name TEXT,
  client_id             UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id)
);
CREATE INDEX IF NOT EXISTS idx_ga4_property_map_client ON ga4_property_map(client_id);
CREATE INDEX IF NOT EXISTS idx_ga4_property_map_conn   ON ga4_property_map(connection_id);

-- Daily GA4 metrics, segmented by Default Channel Group. Rolls up to top-line
-- totals via SUM. UNIQUE key makes the sync idempotent (upsert).
CREATE TABLE IF NOT EXISTS ga4_daily_channel (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id        UUID NOT NULL REFERENCES social_connections(id) ON DELETE CASCADE,
  client_id            UUID REFERENCES agency_clients(id) ON DELETE SET NULL,
  property_id          TEXT NOT NULL,
  metric_date          DATE NOT NULL,
  channel_group        TEXT NOT NULL,        -- GA4 sessionDefaultChannelGroup
  sessions             INTEGER       NOT NULL DEFAULT 0,
  total_users          INTEGER       NOT NULL DEFAULT 0,
  new_users            INTEGER       NOT NULL DEFAULT 0,
  engaged_sessions     INTEGER       NOT NULL DEFAULT 0,
  engagement_rate      NUMERIC(8,4)  NOT NULL DEFAULT 0,
  avg_session_duration NUMERIC(10,2) NOT NULL DEFAULT 0,
  key_events           NUMERIC(12,2) NOT NULL DEFAULT 0,  -- GA4 conversions
  purchase_revenue     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- 0 for lead-gen
  synced_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (connection_id, metric_date, channel_group)
);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_client_date ON ga4_daily_channel(client_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_ga4_daily_channel_conn_date   ON ga4_daily_channel(connection_id, metric_date);
```

- [ ] **Step 2: Run the migration**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/121-ga4-funnel.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` output, no errors.

- [ ] **Step 3: Verify the tables exist**

```bash
psql "$DATABASE_URL" -c "\d ga4_property_map" -c "\d ga4_daily_channel"
```
Expected: both tables print with the columns above.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/121-ga4-funnel.sql
git commit -m "feat(ga4): migration 121 — ga4_property_map + ga4_daily_channel tables"
```

---

## Task 2: Runtime config — GA4 redirect URI

**Files:**
- Modify: `nuxt.config.ts` (runtimeConfig block, near `googleRedirectUri` ~line 59)

- [ ] **Step 1: Add the config key**

In `nuxt.config.ts`, directly under the `googleRedirectUri` line inside `runtimeConfig`, add:

```ts
    ga4RedirectUri: process.env.GA4_REDIRECT_URI || '/api/agency/social/ga4/callback',
```

- [ ] **Step 2: Verify it resolves**

Run: `pnpm exec nuxi typecheck 2>&1 | grep -i ga4RedirectUri || echo "no ga4RedirectUri type errors"`
Expected: `no ga4RedirectUri type errors` (the key is now part of runtime config).

- [ ] **Step 3: Commit**

```bash
git add nuxt.config.ts
git commit -m "feat(ga4): add ga4RedirectUri runtime config"
```

> **Note for the operator (not a code step):** register `https://<prod-host>/api/agency/social/ga4/callback` as an authorized redirect URI in the same Google Cloud OAuth client used for Google Ads, and enable the **Google Analytics Data API** and **Google Analytics Admin API**. No new client ID/secret needed — `googleClientId`/`googleClientSecret` are reused.

---

## Task 3: channelMap util (TDD)

**Files:**
- Create: `server/utils/channelMap.ts`
- Test: `test/utils/channelMap.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/channelMap.test.ts
import { describe, it, expect } from 'vitest'
import { adPlatformToChannel, leadSourceToChannel } from '~~/server/utils/channelMap'

describe('adPlatformToChannel', () => {
  it('maps google ad platforms to Paid Search', () => {
    expect(adPlatformToChannel('google_ads')).toBe('Paid Search')
    expect(adPlatformToChannel('google')).toBe('Paid Search')
  })
  it('maps meta ad platforms to Paid Social', () => {
    expect(adPlatformToChannel('meta')).toBe('Paid Social')
    expect(adPlatformToChannel('meta_ads')).toBe('Paid Social')
  })
  it('returns null for unknown platforms', () => {
    expect(adPlatformToChannel('tiktok')).toBeNull()
    expect(adPlatformToChannel('')).toBeNull()
  })
})

describe('leadSourceToChannel', () => {
  it('maps lead sources to paid channels', () => {
    expect(leadSourceToChannel('google')).toBe('Paid Search')
    expect(leadSourceToChannel('meta')).toBe('Paid Social')
  })
  it('returns null for non-attributable sources', () => {
    expect(leadSourceToChannel('manual')).toBeNull()
    expect(leadSourceToChannel('webhook')).toBeNull()
    expect(leadSourceToChannel('csv')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/channelMap.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/channelMap`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/channelMap.ts
/**
 * Single source of truth mapping ad platforms and lead sources onto GA4
 * Default Channel Groups. Used by the funnel endpoints to join spend + leads
 * onto GA4 channel rows. Keep in sync with GA4's sessionDefaultChannelGroup
 * values for paid traffic.
 */

/** media_spend.platform → GA4 channel group, or null if not a paid channel we map. */
export function adPlatformToChannel(platform: string): string | null {
  switch (platform) {
    case 'google_ads':
    case 'google':
      return 'Paid Search'
    case 'meta':
    case 'meta_ads':
      return 'Paid Social'
    default:
      return null
  }
}

/** leads.source → GA4 channel group, or null if not attributable to a paid channel. */
export function leadSourceToChannel(source: string): string | null {
  switch (source) {
    case 'google':
      return 'Paid Search'
    case 'meta':
      return 'Paid Social'
    default:
      return null
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/channelMap.test.ts`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add server/utils/channelMap.ts test/utils/channelMap.test.ts
git commit -m "feat(ga4): channelMap util mapping platforms/sources to GA4 channels"
```

---

## Task 4: ga4Client util — auth URL, property listing, runReport + parser (TDD on parser)

**Files:**
- Create: `server/utils/ga4Client.ts`
- Test: `test/utils/ga4Client.test.ts`

- [ ] **Step 1: Write the failing test (parser only — the pure, risky part)**

```ts
// test/utils/ga4Client.test.ts
import { describe, it, expect } from 'vitest'
import { parseGa4Report, GA4_METRICS } from '~~/server/utils/ga4Client'

describe('parseGa4Report', () => {
  it('parses dimension+metric rows into typed objects with ISO dates', () => {
    const resp = {
      rows: [
        {
          dimensionValues: [{ value: '20260515' }, { value: 'Paid Search' }],
          metricValues: [
            { value: '120' }, { value: '100' }, { value: '40' }, { value: '90' },
            { value: '0.75' }, { value: '63.5' }, { value: '8' }, { value: '0' }
          ]
        }
      ]
    }
    const rows = parseGa4Report(resp as any)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      date: '2026-05-15',
      channelGroup: 'Paid Search',
      sessions: 120,
      totalUsers: 100,
      newUsers: 40,
      engagedSessions: 90,
      engagementRate: 0.75,
      avgSessionDuration: 63.5,
      keyEvents: 8,
      purchaseRevenue: 0
    })
  })

  it('returns [] when the API omits rows', () => {
    expect(parseGa4Report({} as any)).toEqual([])
  })

  it('defaults a missing channel to (not set) and coerces missing metrics to 0', () => {
    const resp = { rows: [{ dimensionValues: [{ value: '20260101' }], metricValues: [] }] }
    const rows = parseGa4Report(resp as any)
    expect(rows[0].channelGroup).toBe('(not set)')
    expect(rows[0].sessions).toBe(0)
  })

  it('keeps GA4_METRICS request order aligned with the parser (8 metrics)', () => {
    expect(GA4_METRICS).toHaveLength(8)
    expect(GA4_METRICS[0]).toBe('sessions')
    expect(GA4_METRICS[7]).toBe('purchaseRevenue')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/ga4Client.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/ga4Client`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ga4Client.ts
/**
 * GA4 Data API + Admin API client.
 * - getGa4AuthUrl: OAuth consent URL (analytics.readonly + openid email).
 * - listGa4Properties: Admin API accountSummaries for the property picker.
 * - ga4RunReport / parseGa4Report: daily channel metrics via Data API runReport.
 * Token exchange/refresh reuse exchangeGoogleCode/refreshGoogleToken from
 * googleAdsClient.ts — GA4 uses the same Google OAuth client.
 */
import { ofetch } from 'ofetch'

const GOOGLE_OAUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth'
const GA4_DATA_BASE = 'https://analyticsdata.googleapis.com/v1beta'
const GA4_ADMIN_BASE = 'https://analyticsadmin.googleapis.com/v1beta'

/** openid+email so the callback can key the connection by stable Google account id. */
export const GA4_SCOPE = 'openid email https://www.googleapis.com/auth/analytics.readonly'

/**
 * Metric request order. The parser maps metricValues by index, so this array is
 * the contract between request and parse — do not reorder without updating both.
 * Note: GA4 API metric name is 'averageSessionDuration'; we surface it as
 * avgSessionDuration on the parsed row.
 */
export const GA4_METRICS = [
  'sessions',
  'totalUsers',
  'newUsers',
  'engagedSessions',
  'engagementRate',
  'averageSessionDuration',
  'keyEvents',
  'purchaseRevenue'
] as const

export interface Ga4ReportRow {
  date: string          // YYYY-MM-DD
  channelGroup: string
  sessions: number
  totalUsers: number
  newUsers: number
  engagedSessions: number
  engagementRate: number
  avgSessionDuration: number
  keyEvents: number
  purchaseRevenue: number
}

interface Ga4RunReportResponse {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>
    metricValues?: Array<{ value?: string }>
  }>
}

interface AccountSummariesResponse {
  accountSummaries?: Array<{
    account?: string
    displayName?: string
    propertySummaries?: Array<{ property?: string; displayName?: string }>
  }>
}

export function getGa4AuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: GA4_SCOPE,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent'
  })
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`
}

/** Fetch the Google account identity (sub + email) for keying the connection row. */
export async function getGoogleUserInfo(accessToken: string): Promise<{ sub: string; email: string }> {
  const info = await ofetch<{ sub: string; email?: string }>(
    'https://openidconnect.googleapis.com/v1/userinfo',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  return { sub: info.sub, email: info.email || info.sub }
}

export async function listGa4Properties(
  accessToken: string
): Promise<Array<{ accountName: string; propertyId: string; propertyDisplayName: string }>> {
  const resp = await ofetch<AccountSummariesResponse>(
    `${GA4_ADMIN_BASE}/accountSummaries?pageSize=200`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  const out: Array<{ accountName: string; propertyId: string; propertyDisplayName: string }> = []
  for (const acc of resp.accountSummaries || []) {
    for (const prop of acc.propertySummaries || []) {
      out.push({
        accountName: acc.displayName || acc.account || '',
        propertyId: (prop.property || '').replace('properties/', ''),
        propertyDisplayName: prop.displayName || ''
      })
    }
  }
  return out
}

export function parseGa4Report(resp: Ga4RunReportResponse): Ga4ReportRow[] {
  const rows = resp.rows || []
  return rows.map((r) => {
    const dims = r.dimensionValues || []
    const mets = r.metricValues || []
    const rawDate = dims[0]?.value || ''
    const date = rawDate.length === 8
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate
    const m = (i: number) => Number(mets[i]?.value || 0)
    return {
      date,
      channelGroup: dims[1]?.value || '(not set)',
      sessions: m(0),
      totalUsers: m(1),
      newUsers: m(2),
      engagedSessions: m(3),
      engagementRate: m(4),
      avgSessionDuration: m(5),
      keyEvents: m(6),
      purchaseRevenue: m(7)
    }
  })
}

export async function ga4RunReport(
  propertyId: string,
  accessToken: string,
  opts: { startDate: string; endDate: string }
): Promise<Ga4ReportRow[]> {
  const resp = await ofetch<Ga4RunReportResponse>(
    `${GA4_DATA_BASE}/properties/${propertyId}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
      body: {
        dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }],
        metrics: GA4_METRICS.map((name) => ({ name })),
        dateRanges: [{ startDate: opts.startDate, endDate: opts.endDate }],
        limit: 100000
      }
    }
  )
  return parseGa4Report(resp)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/ga4Client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ga4Client.ts test/utils/ga4Client.test.ts
git commit -m "feat(ga4): ga4Client — auth URL, property listing, runReport + parser"
```

---

## Task 5: OAuth connect endpoint

**Files:**
- Create: `server/api/agency/social/ga4/connect.get.ts`

- [ ] **Step 1: Write the handler** (mirrors `social/google/connect.get.ts`, GA4 cookie + redirect)

```ts
import { setCookie, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { getGa4AuthUrl } from '~~/server/utils/ga4Client'

/**
 * GET /api/agency/social/ga4/connect
 * Returns a Google OAuth URL scoped for GA4 (analytics.readonly + openid email).
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const config = useRuntimeConfig()
  if (!config.googleClientId || !config.googleClientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'Google credentials not configured' })
  }

  const state = crypto.randomUUID()
  setCookie(event, 'ga4_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 10
  })

  const reqUrl = getRequestURL(event)
  const configured = config.ga4RedirectUri
  const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
  const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

  return { url: getGa4AuthUrl(config.googleClientId, redirectUri, state) }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec vitest run test/utils/ga4Client.test.ts && pnpm exec nuxi typecheck 2>&1 | grep "ga4/connect" || echo "connect endpoint OK"`
Expected: `connect endpoint OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/connect.get.ts
git commit -m "feat(ga4): OAuth connect endpoint"
```

---

## Task 6: OAuth callback endpoint

**Files:**
- Create: `server/api/agency/social/ga4/callback.get.ts`

- [ ] **Step 1: Write the handler** (mirrors `social/google/callback.get.ts`; stores ONE `platform='ga4'` row keyed by Google account)

```ts
import { getCookie, deleteCookie, sendRedirect, getRequestURL } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { exchangeGoogleCode } from '~~/server/utils/googleAdsClient'
import { getGoogleUserInfo, GA4_SCOPE } from '~~/server/utils/ga4Client'

/**
 * GET /api/agency/social/ga4/callback
 * Exchanges the code, identifies the Google account, and upserts a single
 * platform='ga4' connection row holding the tokens. Property→client mapping
 * happens separately in /ga4/map. Every path redirects to /auth/oauth-callback
 * so the popup can report back.
 */
export default eventHandler(async (event) => {
  try {
    const user = await requireAuth(event)
    const query = getQuery(event)

    const code = String(query.code || '')
    const state = String(query.state || '')
    const errorParam = String(query.error || '')
    const expectedState = getCookie(event, 'ga4_oauth_state')

    if (errorParam) {
      const desc = String(query.error_description || errorParam)
      return sendRedirect(event, `/auth/oauth-callback?platform=ga4&success=false&error=${encodeURIComponent(desc)}`, 302)
    }
    if (!code || !state || !expectedState || state !== expectedState) {
      return sendRedirect(event, '/auth/oauth-callback?platform=ga4&success=false&error=' + encodeURIComponent('Invalid OAuth state. Please try again.'), 302)
    }
    deleteCookie(event, 'ga4_oauth_state', { path: '/' })

    const config = useRuntimeConfig()
    const reqUrl = getRequestURL(event)
    const configured = config.ga4RedirectUri
    const callbackPath = configured.startsWith('http') ? new URL(configured).pathname : configured
    const redirectUri = `${reqUrl.protocol}//${reqUrl.host}${callbackPath}`

    const tokens = await exchangeGoogleCode(code, config.googleClientId, config.googleClientSecret, redirectUri)
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : new Date(Date.now() + 60 * 60 * 1000)

    const identity = await getGoogleUserInfo(tokens.access_token)

    await queryOne(
      `INSERT INTO social_connections (platform, account_id, account_name, access_token, refresh_token, token_expires_at, scopes, status, metadata, connected_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (platform, account_id)
       DO UPDATE SET
         access_token = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, social_connections.refresh_token),
         token_expires_at = EXCLUDED.token_expires_at,
         scopes = EXCLUDED.scopes,
         status = 'active',
         account_name = EXCLUDED.account_name,
         connected_by = EXCLUDED.connected_by,
         updated_at = NOW()
       RETURNING id`,
      [
        'ga4',
        identity.sub,
        identity.email,
        tokens.access_token,
        tokens.refresh_token || null,
        expiresAt,
        GA4_SCOPE.split(' '),
        'active',
        JSON.stringify({ email: identity.email }),
        user.id
      ]
    )

    return sendRedirect(event, '/auth/oauth-callback?platform=ga4&success=true', 302)
  } catch (err: any) {
    console.error('[GA4 Callback] Error:', err.message || err)
    const msg = err.data?.error?.message || err.message || 'Connection failed'
    return sendRedirect(event, `/auth/oauth-callback?platform=ga4&success=false&error=${encodeURIComponent(msg)}`, 302)
  }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "ga4/callback" || echo "callback endpoint OK"`
Expected: `callback endpoint OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/callback.get.ts
git commit -m "feat(ga4): OAuth callback — store ga4 connection keyed by Google account"
```

---

## Task 7: Properties listing endpoint

**Files:**
- Create: `server/api/agency/social/ga4/properties.get.ts`

- [ ] **Step 1: Write the handler** (refresh token if needed, list properties, include existing maps)

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { refreshGoogleToken } from '~~/server/utils/googleAdsClient'
import { listGa4Properties } from '~~/server/utils/ga4Client'

/**
 * GET /api/agency/social/ga4/properties
 * Lists GA4 properties visible to each active ga4 connection, plus current
 * property→client mappings, for the picker UI.
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const config = useRuntimeConfig()

  const conns = await queryRows<{
    id: string; account_name: string; access_token: string
    refresh_token: string | null; token_expires_at: string | null
  }>(`SELECT id, account_name, access_token, refresh_token, token_expires_at
      FROM social_connections WHERE platform = 'ga4' AND status = 'active'`)

  const connections: Array<{ connectionId: string; accountName: string; properties: any[] }> = []
  for (const c of conns) {
    let token = c.access_token
    if (c.refresh_token && c.token_expires_at &&
        new Date(c.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
      const refreshed = await refreshGoogleToken(c.refresh_token, config.googleClientId, config.googleClientSecret)
      token = refreshed.access_token
      await execute(
        `UPDATE social_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW() WHERE id=$3`,
        [token, new Date(Date.now() + (refreshed.expires_in || 3600) * 1000), c.id]
      )
    }
    const properties = await listGa4Properties(token).catch(() => [])
    connections.push({ connectionId: c.id, accountName: c.account_name, properties })
  }

  const maps = await queryRows<{ property_id: string; client_id: string; property_display_name: string }>(
    `SELECT property_id, client_id, property_display_name FROM ga4_property_map`
  )

  return { connections, maps }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "ga4/properties" || echo "properties endpoint OK"`
Expected: `properties endpoint OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/properties.get.ts
git commit -m "feat(ga4): list GA4 properties + current mappings"
```

---

## Task 8: Property→client map endpoint

**Files:**
- Create: `server/api/agency/social/ga4/map.post.ts`

- [ ] **Step 1: Write the handler** (Zod-validated upsert into `ga4_property_map`)

```ts
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

const schema = z.object({
  connectionId: z.string().uuid(),
  propertyId: z.string().min(1),
  propertyDisplayName: z.string().optional().default(''),
  clientId: z.string().uuid()
})

/**
 * POST /api/agency/social/ga4/map
 * Maps a GA4 property to a client (one property → one client; re-mapping a
 * property updates the existing row).
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = schema.parse(await readBody(event))

  await execute(
    `INSERT INTO ga4_property_map (connection_id, property_id, property_display_name, client_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (property_id)
     DO UPDATE SET connection_id = EXCLUDED.connection_id,
                   property_display_name = EXCLUDED.property_display_name,
                   client_id = EXCLUDED.client_id,
                   updated_at = NOW()`,
    [body.connectionId, body.propertyId, body.propertyDisplayName, body.clientId]
  )

  return { ok: true }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "ga4/map" || echo "map endpoint OK"`
Expected: `map endpoint OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/map.post.ts
git commit -m "feat(ga4): map GA4 property to client"
```

---

## Task 9: GA4 sync util

**Files:**
- Create: `server/utils/ga4Sync.ts`

- [ ] **Step 1: Write the sync orchestrator**

```ts
// server/utils/ga4Sync.ts
/**
 * Pull daily GA4 channel metrics for every mapped property and upsert into
 * ga4_daily_channel. Mirrors spendSync's structure: load mappings + tokens,
 * refresh if expiring, runReport, upsert. The lookback window re-pulls recent
 * days because GA4 reprocesses data for ~48h.
 */
import { queryRows, execute } from './db'
import { refreshGoogleToken } from './googleAdsClient'
import { ga4RunReport } from './ga4Client'

export interface Ga4SyncResult {
  propertiesSynced: number
  rowsUpserted: number
  errors: string[]
}

interface MapRow {
  property_id: string
  client_id: string
  connection_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

export async function syncGa4(
  opts: { clientId?: string; lookbackDays?: number } = {}
): Promise<Ga4SyncResult> {
  const { clientId, lookbackDays = 14 } = opts
  const config = useRuntimeConfig()
  const result: Ga4SyncResult = { propertiesSynced: 0, rowsUpserted: 0, errors: [] }

  const params: unknown[] = []
  let where = `c.platform = 'ga4' AND c.status = 'active'`
  if (clientId) { params.push(clientId); where += ` AND m.client_id = $${params.length}` }

  const maps = await queryRows<MapRow>(
    `SELECT m.property_id, m.client_id, m.connection_id,
            c.access_token, c.refresh_token, c.token_expires_at
     FROM ga4_property_map m
     JOIN social_connections c ON c.id = m.connection_id
     WHERE ${where}`,
    params
  )

  const startDate = isoDaysAgo(lookbackDays)
  const endDate = isoDaysAgo(0)

  for (const map of maps) {
    try {
      let token = map.access_token
      if (map.refresh_token && map.token_expires_at &&
          new Date(map.token_expires_at).getTime() < Date.now() + 5 * 60 * 1000) {
        const refreshed = await refreshGoogleToken(map.refresh_token, config.googleClientId, config.googleClientSecret)
        token = refreshed.access_token
        await execute(
          `UPDATE social_connections SET access_token=$1, token_expires_at=$2, updated_at=NOW() WHERE id=$3`,
          [token, new Date(Date.now() + (refreshed.expires_in || 3600) * 1000), map.connection_id]
        )
      }

      const rows = await ga4RunReport(map.property_id, token, { startDate, endDate })
      for (const row of rows) {
        await execute(
          `INSERT INTO ga4_daily_channel
             (connection_id, client_id, property_id, metric_date, channel_group,
              sessions, total_users, new_users, engaged_sessions, engagement_rate,
              avg_session_duration, key_events, purchase_revenue, synced_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW())
           ON CONFLICT (connection_id, metric_date, channel_group)
           DO UPDATE SET
             sessions = EXCLUDED.sessions,
             total_users = EXCLUDED.total_users,
             new_users = EXCLUDED.new_users,
             engaged_sessions = EXCLUDED.engaged_sessions,
             engagement_rate = EXCLUDED.engagement_rate,
             avg_session_duration = EXCLUDED.avg_session_duration,
             key_events = EXCLUDED.key_events,
             purchase_revenue = EXCLUDED.purchase_revenue,
             synced_at = NOW()`,
          [
            map.connection_id, map.client_id, map.property_id, row.date, row.channelGroup,
            row.sessions, row.totalUsers, row.newUsers, row.engagedSessions, row.engagementRate,
            row.avgSessionDuration, row.keyEvents, row.purchaseRevenue
          ]
        )
        result.rowsUpserted++
      }
      result.propertiesSynced++
    } catch (err: any) {
      result.errors.push(`property ${map.property_id}: ${err.message || err}`)
    }
  }

  return result
}
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "ga4Sync" || echo "ga4Sync OK"`
Expected: `ga4Sync OK`.

- [ ] **Step 3: Commit**

```bash
git add server/utils/ga4Sync.ts
git commit -m "feat(ga4): syncGa4 — pull daily channel metrics, upsert ga4_daily_channel"
```

---

## Task 10: Manual sync endpoint

**Files:**
- Create: `server/api/agency/social/ga4/sync.post.ts`

- [ ] **Step 1: Write the handler** (background via `waitUntil`, mirroring spend sync)

```ts
import { requireAuth } from '~~/server/utils/auth'
import { runSpendSyncInBackground } from '~~/server/utils/asyncBackground'
import { syncGa4 } from '~~/server/utils/ga4Sync'

/**
 * POST /api/agency/social/ga4/sync
 * Kicks off a GA4 metrics sync in the background and returns immediately.
 * Body: { clientId?: string, lookbackDays?: number }
 */
export default eventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event).catch(() => null)
  const clientId = body?.clientId as string | undefined
  const lookbackDays = typeof body?.lookbackDays === 'number' ? body.lookbackDays : 14

  return runSpendSyncInBackground(event, {
    label: `ga4 sync ${clientId || 'all'}`,
    sync: () => syncGa4({ clientId, lookbackDays }),
    kvKeys: []
  })
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "ga4/sync" || echo "manual sync OK"`
Expected: `manual sync OK`. (If `runSpendSyncInBackground` requires a non-empty `kvKeys`, check its signature in `server/utils/asyncBackground.ts` and pass `[]` or omit per its type.)

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/social/ga4/sync.post.ts
git commit -m "feat(ga4): manual background sync endpoint"
```

---

## Task 11: Daily cron endpoint

**Files:**
- Create: `server/api/cron/ga4-sync.post.ts`

- [ ] **Step 1: Write the handler** (x-cron-secret auth with dev bypass, mirroring existing crons)

```ts
import { defineEventHandler, getHeader, createError } from 'h3'
import { syncGa4 } from '~~/server/utils/ga4Sync'

/**
 * POST /api/cron/ga4-sync
 * Daily GA4 metrics pull across all mapped properties. Auth: x-cron-secret
 * (dev bypass). Schedule 0 * * * * is fine — it's idempotent; running hourly
 * just refreshes the 14-day window more often.
 */
export default defineEventHandler(async (event) => {
  const cronSecret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && cronSecret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const result = await syncGa4({ lookbackDays: 14 })
  return { ok: true, ...result }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "cron/ga4-sync" || echo "cron OK"`
Expected: `cron OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/cron/ga4-sync.post.ts
git commit -m "feat(ga4): daily cron sync endpoint"
```

> **Note for the operator (not a code step):** add a Cloudflare Pages cron trigger `0 * * * *` → `POST /api/cron/ga4-sync` with header `x-cron-secret: $CRON_SECRET`.

---

## Task 12: Funnel merge math util (TDD)

**Files:**
- Create: `server/utils/ga4Funnel.ts`
- Test: `test/utils/ga4Funnel.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/ga4Funnel.test.ts
import { describe, it, expect } from 'vitest'
import { buildFunnel } from '~~/server/utils/ga4Funnel'

describe('buildFunnel', () => {
  it('merges spend, ga4 and leads by channel and computes cost ratios', () => {
    const out = buildFunnel({
      spendByChannel: { 'Paid Search': 1000, 'Paid Social': 500 },
      ga4ByChannel: {
        'Paid Search': { sessions: 2000, engagedSessions: 1500, keyEvents: 80 },
        'Paid Social': { sessions: 1000, engagedSessions: 600, keyEvents: 30 },
        'Organic Search': { sessions: 4000, engagedSessions: 3000, keyEvents: 50 }
      },
      leadsByChannel: { 'Paid Search': 40, 'Paid Social': 20 }
    })

    const ps = out.channels.find((c) => c.channel === 'Paid Search')!
    expect(ps.spend).toBe(1000)
    expect(ps.sessions).toBe(2000)
    expect(ps.keyEvents).toBe(80)
    expect(ps.leads).toBe(40)
    expect(ps.costPerSession).toBeCloseTo(0.5)
    expect(ps.costPerKeyEvent).toBeCloseTo(12.5)
    expect(ps.costPerLead).toBeCloseTo(25)
    expect(ps.sessionToLeadRate).toBeCloseTo(0.02)

    // Organic has sessions but no spend → cost ratios are null, not Infinity.
    const org = out.channels.find((c) => c.channel === 'Organic Search')!
    expect(org.spend).toBe(0)
    expect(org.costPerSession).toBeNull()

    // Totals sum across all channels.
    expect(out.totals.spend).toBe(1500)
    expect(out.totals.sessions).toBe(7000)
    expect(out.totals.leads).toBe(60)
  })

  it('sorts channels by spend desc then sessions desc', () => {
    const out = buildFunnel({
      spendByChannel: { 'Paid Social': 500, 'Paid Search': 1000 },
      ga4ByChannel: {
        'Direct': { sessions: 9000, engagedSessions: 5000, keyEvents: 10 },
        'Paid Search': { sessions: 2000, engagedSessions: 1500, keyEvents: 80 },
        'Paid Social': { sessions: 1000, engagedSessions: 600, keyEvents: 30 }
      },
      leadsByChannel: {}
    })
    expect(out.channels.map((c) => c.channel)).toEqual(['Paid Search', 'Paid Social', 'Direct'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/utils/ga4Funnel.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/ga4Funnel`.

- [ ] **Step 3: Write the implementation**

```ts
// server/utils/ga4Funnel.ts
/**
 * Merge spend (ad platforms), GA4 channel metrics, and owned leads into a
 * single per-channel funnel, plus a totals row. All three inputs are keyed by
 * GA4 channel group (see channelMap.ts). Cost ratios are null — not Infinity —
 * when spend is 0 (e.g. organic channels) or the denominator is 0.
 */

export interface FunnelChannelRow {
  channel: string
  spend: number
  sessions: number
  engagedSessions: number
  keyEvents: number
  leads: number
  costPerSession: number | null
  costPerKeyEvent: number | null
  costPerLead: number | null
  sessionToLeadRate: number | null
}

interface Ga4ChannelAgg { sessions: number; engagedSessions: number; keyEvents: number }

export interface FunnelInput {
  spendByChannel: Record<string, number>
  ga4ByChannel: Record<string, Ga4ChannelAgg>
  leadsByChannel: Record<string, number>
}

function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null
  return numerator / denominator
}

function emptyRow(channel: string): FunnelChannelRow {
  return {
    channel, spend: 0, sessions: 0, engagedSessions: 0, keyEvents: 0, leads: 0,
    costPerSession: null, costPerKeyEvent: null, costPerLead: null, sessionToLeadRate: null
  }
}

export function buildFunnel(input: FunnelInput): { channels: FunnelChannelRow[]; totals: FunnelChannelRow } {
  const channels = new Set<string>([
    ...Object.keys(input.spendByChannel),
    ...Object.keys(input.ga4ByChannel),
    ...Object.keys(input.leadsByChannel)
  ])

  const rows: FunnelChannelRow[] = []
  for (const channel of channels) {
    const spend = input.spendByChannel[channel] || 0
    const ga4 = input.ga4ByChannel[channel] || { sessions: 0, engagedSessions: 0, keyEvents: 0 }
    const leads = input.leadsByChannel[channel] || 0
    rows.push({
      channel,
      spend,
      sessions: ga4.sessions,
      engagedSessions: ga4.engagedSessions,
      keyEvents: ga4.keyEvents,
      leads,
      costPerSession: spend ? ratio(spend, ga4.sessions) : null,
      costPerKeyEvent: spend ? ratio(spend, ga4.keyEvents) : null,
      costPerLead: spend ? ratio(spend, leads) : null,
      sessionToLeadRate: ratio(leads, ga4.sessions)
    })
  }

  rows.sort((a, b) => (b.spend - a.spend) || (b.sessions - a.sessions))

  const totals = rows.reduce((acc, r) => {
    acc.spend += r.spend
    acc.sessions += r.sessions
    acc.engagedSessions += r.engagedSessions
    acc.keyEvents += r.keyEvents
    acc.leads += r.leads
    return acc
  }, emptyRow('All channels'))
  totals.costPerSession = totals.spend ? ratio(totals.spend, totals.sessions) : null
  totals.costPerKeyEvent = totals.spend ? ratio(totals.spend, totals.keyEvents) : null
  totals.costPerLead = totals.spend ? ratio(totals.spend, totals.leads) : null
  totals.sessionToLeadRate = ratio(totals.leads, totals.sessions)

  return { channels: rows, totals }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/utils/ga4Funnel.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/ga4Funnel.ts test/utils/ga4Funnel.test.ts
git commit -m "feat(ga4): buildFunnel — merge spend/ga4/leads by channel with cost ratios"
```

---

## Task 13: Portal funnel endpoint

**Files:**
- Create: `server/api/portal/analytics/funnel.get.ts`

- [ ] **Step 1: Write the handler** (client-auth; three grouped queries → buildFunnel)

```ts
/**
 * Portal Funnel — client-scoped
 * GET /api/portal/analytics/funnel?startDate=&endDate=
 * Joins ad spend + GA4 channel metrics + owned (portal-visible) leads at GA4
 * channel grain. Channel mapping in SQL must match server/utils/channelMap.ts.
 */
import { queryRows } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { PORTAL_VISIBLE_LEADS_EXISTS } from '~~/server/utils/leads/portalAnalytics'
import { buildFunnel } from '~~/server/utils/ga4Funnel'

const SPEND_CHANNEL_CASE = `CASE
  WHEN ms.platform IN ('google_ads','google') THEN 'Paid Search'
  WHEN ms.platform IN ('meta','meta_ads') THEN 'Paid Social'
  ELSE 'Other' END`

const LEAD_CHANNEL_CASE = `CASE
  WHEN l.source = 'google' THEN 'Paid Search'
  WHEN l.source = 'meta' THEN 'Paid Social'
  ELSE 'Other' END`

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)
  if (!clientUser.permissions.canViewAnalytics) {
    throw createError({ statusCode: 403, statusMessage: 'Analytics access not enabled' })
  }
  const clientId = clientUser.clientId
  const q = getQuery(event)
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }

  // Spend by channel (daily_spend joined to media_spend, client-scoped).
  const spendRows = await queryRows<{ channel: string; spend: string }>(
    `SELECT ${SPEND_CHANNEL_CASE} AS channel, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  // GA4 metrics by channel.
  const ga4Rows = await queryRows<{ channel: string; sessions: string; engaged: string; key_events: string }>(
    `SELECT channel_group AS channel,
            COALESCE(SUM(sessions),0) AS sessions,
            COALESCE(SUM(engaged_sessions),0) AS engaged,
            COALESCE(SUM(key_events),0) AS key_events
     FROM ga4_daily_channel
     WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  // Portal-visible leads by channel.
  const leadRows = await queryRows<{ channel: string; leads: string }>(
    `SELECT ${LEAD_CHANNEL_CASE} AS channel, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1
       AND l.deleted_at IS NULL
       AND l.submitted_at::date BETWEEN $2 AND $3
       AND ${PORTAL_VISIBLE_LEADS_EXISTS}
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) spendByChannel[r.channel] = Number(r.spend)

  const ga4ByChannel: Record<string, { sessions: number; engagedSessions: number; keyEvents: number }> = {}
  for (const r of ga4Rows) {
    ga4ByChannel[r.channel] = {
      sessions: Number(r.sessions),
      engagedSessions: Number(r.engaged),
      keyEvents: Number(r.key_events)
    }
  }

  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) leadsByChannel[r.channel] = Number(r.leads)

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  const hasGa4 = ga4Rows.length > 0
  return { ...funnel, hasGa4 }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "portal/analytics/funnel" || echo "portal funnel OK"`
Expected: `portal funnel OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/portal/analytics/funnel.get.ts
git commit -m "feat(ga4): portal funnel endpoint joining spend + GA4 + leads by channel"
```

---

## Task 14: Agency funnel endpoint (internal twin)

**Files:**
- Create: `server/api/agency/analytics/funnel.get.ts`

- [ ] **Step 1: Write the handler** (staff-auth; clientId from query; same three queries → buildFunnel)

```ts
/**
 * Agency Funnel — staff-facing internal twin of the portal funnel.
 * GET /api/agency/analytics/funnel?clientId=&startDate=&endDate=
 */
import { queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { buildClientCondition } from '~~/server/utils/analyticsMetrics'
import { buildFunnel } from '~~/server/utils/ga4Funnel'

const SPEND_CHANNEL_CASE = `CASE
  WHEN ms.platform IN ('google_ads','google') THEN 'Paid Search'
  WHEN ms.platform IN ('meta','meta_ads') THEN 'Paid Social'
  ELSE 'Other' END`

const LEAD_CHANNEL_CASE = `CASE
  WHEN l.source = 'google' THEN 'Paid Search'
  WHEN l.source = 'meta' THEN 'Paid Social'
  ELSE 'Other' END`

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  if (!clientId || !startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'clientId, startDate and endDate are required' })
  }

  const spendRows = await queryRows<{ channel: string; spend: string }>(
    `SELECT ${SPEND_CHANNEL_CASE} AS channel, COALESCE(SUM(ds.spend),0) AS spend
     FROM daily_spend ds
     JOIN media_spend ms ON ms.id = ds.media_spend_id
     WHERE ${buildClientCondition(1)} AND ds.spend_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )
  const ga4Rows = await queryRows<{ channel: string; sessions: string; engaged: string; key_events: string }>(
    `SELECT channel_group AS channel,
            COALESCE(SUM(sessions),0) AS sessions,
            COALESCE(SUM(engaged_sessions),0) AS engaged,
            COALESCE(SUM(key_events),0) AS key_events
     FROM ga4_daily_channel
     WHERE client_id = $1 AND metric_date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )
  const leadRows = await queryRows<{ channel: string; leads: string }>(
    `SELECT ${LEAD_CHANNEL_CASE} AS channel, COUNT(*) AS leads
     FROM leads l
     WHERE l.client_id = $1 AND l.deleted_at IS NULL
       AND l.submitted_at::date BETWEEN $2 AND $3
     GROUP BY 1`,
    [clientId, startDate, endDate]
  )

  const spendByChannel: Record<string, number> = {}
  for (const r of spendRows) spendByChannel[r.channel] = Number(r.spend)
  const ga4ByChannel: Record<string, { sessions: number; engagedSessions: number; keyEvents: number }> = {}
  for (const r of ga4Rows) ga4ByChannel[r.channel] = { sessions: Number(r.sessions), engagedSessions: Number(r.engaged), keyEvents: Number(r.key_events) }
  const leadsByChannel: Record<string, number> = {}
  for (const r of leadRows) leadsByChannel[r.channel] = Number(r.leads)

  const funnel = buildFunnel({ spendByChannel, ga4ByChannel, leadsByChannel })
  return { ...funnel, hasGa4: ga4Rows.length > 0 }
})
```

- [ ] **Step 2: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep "agency/analytics/funnel" || echo "agency funnel OK"`
Expected: `agency funnel OK`.

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/analytics/funnel.get.ts
git commit -m "feat(ga4): agency funnel endpoint (internal twin)"
```

---

## Task 15: Agency GA4 connect + property-picker UI

**Files:**
- Create: `app/components/social/Ga4ConnectCard.vue`
- Modify: `app/pages/agency/social/index.vue` (render `<SocialGa4ConnectCard />` near the existing connect controls)

**Context:** The OAuth popup posts back to `/auth/oauth-callback`; follow the existing pattern used by the Google/Meta connect buttons in `app/pages/agency/social/index.vue` (open `url` from the connect endpoint in a popup). This component does the connect, then loads properties + clients and lets staff map each property to a client.

- [ ] **Step 1: Write the component**

```vue
<!-- app/components/social/Ga4ConnectCard.vue -->
<script setup lang="ts">
interface Ga4Property { accountName: string; propertyId: string; propertyDisplayName: string }
interface Ga4Connection { connectionId: string; accountName: string; properties: Ga4Property[] }
interface Ga4Map { property_id: string; client_id: string; property_display_name: string }
interface ClientOption { label: string; value: string }

const toast = useToast()
const loading = ref(false)
const connections = ref<Ga4Connection[]>([])
const maps = ref<Ga4Map[]>([])
const clientOptions = ref<ClientOption[]>([])
const selectedClient = reactive<Record<string, string>>({}) // propertyId -> clientId

async function loadProperties() {
  loading.value = true
  try {
    const res = await $fetch<{ connections: Ga4Connection[]; maps: Ga4Map[] }>('/api/agency/social/ga4/properties')
    connections.value = res.connections
    maps.value = res.maps
    for (const m of res.maps) selectedClient[m.property_id] = m.client_id
  } catch (err: any) {
    toast.add({ title: 'Failed to load GA4 properties', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

async function loadClients() {
  // agency_clients list — reuse the existing clients endpoint
  const res = await $fetch<Array<{ id: string; name: string }>>('/api/agency/clients').catch(() => [])
  clientOptions.value = res.map((c) => ({ label: c.name, value: c.id }))
}

function connect() {
  $fetch<{ url: string }>('/api/agency/social/ga4/connect').then(({ url }) => {
    const popup = window.open(url, 'ga4_oauth', 'width=520,height=640')
    const timer = setInterval(() => {
      if (popup?.closed) { clearInterval(timer); loadProperties() }
    }, 800)
  })
}

async function mapProperty(conn: Ga4Connection, prop: Ga4Property) {
  const clientId = selectedClient[prop.propertyId]
  if (!clientId) return
  try {
    await $fetch('/api/agency/social/ga4/map', {
      method: 'POST',
      body: { connectionId: conn.connectionId, propertyId: prop.propertyId, propertyDisplayName: prop.propertyDisplayName, clientId }
    })
    toast.add({ title: 'Mapped', description: `${prop.propertyDisplayName} → client`, color: 'success' })
    await loadProperties()
  } catch (err: any) {
    toast.add({ title: 'Mapping failed', description: err.data?.statusMessage || err.message, color: 'error' })
  }
}

async function syncNow() {
  await $fetch('/api/agency/social/ga4/sync', { method: 'POST', body: { lookbackDays: 90 } })
  toast.add({ title: 'GA4 sync started', description: 'Pulling the last 90 days in the background.', color: 'success' })
}

onMounted(() => { loadClients(); loadProperties() })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-line-chart" class="text-primary" />
          <span class="font-semibold">Google Analytics 4</span>
        </div>
        <div class="flex gap-2">
          <UButton size="sm" variant="soft" icon="i-lucide-link" @click="connect">Connect Google Analytics</UButton>
          <UButton size="sm" variant="ghost" icon="i-lucide-refresh-cw" :disabled="!connections.length" @click="syncNow">Sync now</UButton>
        </div>
      </div>
    </template>

    <div v-if="loading" class="py-6 text-center text-muted">Loading properties…</div>
    <div v-else-if="!connections.length" class="py-6 text-center text-muted">
      No GA4 account connected yet. Connect a Google account with access to your clients' GA4 properties.
    </div>
    <div v-else class="space-y-6">
      <div v-for="conn in connections" :key="conn.connectionId">
        <p class="text-sm text-muted mb-2">{{ conn.accountName }}</p>
        <div v-if="!conn.properties.length" class="text-sm text-muted">No properties visible to this account.</div>
        <div v-for="prop in conn.properties" :key="prop.propertyId" class="flex items-center gap-3 py-2 border-b border-default last:border-0">
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium truncate">{{ prop.propertyDisplayName }}</p>
            <p class="text-xs text-muted">{{ prop.accountName }} · {{ prop.propertyId }}</p>
          </div>
          <USelectMenu
            v-model="selectedClient[prop.propertyId]"
            :items="clientOptions"
            value-key="value"
            placeholder="Map to client…"
            class="w-56"
          />
          <UButton size="sm" :disabled="!selectedClient[prop.propertyId]" @click="mapProperty(conn, prop)">Save</UButton>
        </div>
      </div>
    </div>
  </UCard>
</template>
```

- [ ] **Step 2: Render it on the social page**

In `app/pages/agency/social/index.vue`, add the component to the template near the existing platform-connection controls (top of the connections section):

```vue
        <SocialGa4ConnectCard class="mb-6" />
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep -iE "Ga4ConnectCard|social/index" || echo "GA4 connect UI OK"`
Expected: `GA4 connect UI OK`. (If `/api/agency/clients` returns a different shape, adjust `loadClients` to match — confirm via `ls server/api/agency/clients/`.)

- [ ] **Step 4: Commit**

```bash
git add app/components/social/Ga4ConnectCard.vue app/pages/agency/social/index.vue
git commit -m "feat(ga4): agency connect card + property→client picker"
```

---

## Task 16: Portal "Website & Funnel" section

**Files:**
- Create: `app/components/portal/FunnelChart.client.vue`
- Modify: `app/pages/portal/analytics/index.vue` (render `<PortalFunnelChart :start-date="..." :end-date="..." />` in a new section)

- [ ] **Step 1: Write the funnel component** (channel table + funnel bars; hides if no GA4)

```vue
<!-- app/components/portal/FunnelChart.client.vue -->
<script setup lang="ts">
const props = defineProps<{ startDate: string; endDate: string }>()
const { fmtCurrency, fmtCompact } = useAnalytics()

interface FunnelRow {
  channel: string; spend: number; sessions: number; engagedSessions: number
  keyEvents: number; leads: number
  costPerSession: number | null; costPerKeyEvent: number | null
  costPerLead: number | null; sessionToLeadRate: number | null
}
interface FunnelResponse { channels: FunnelRow[]; totals: FunnelRow; hasGa4: boolean }

const { data, pending } = await useFetch<FunnelResponse>('/api/portal/analytics/funnel', {
  query: { startDate: () => props.startDate, endDate: () => props.endDate },
  watch: [() => props.startDate, () => props.endDate]
})

const columns = [
  { accessorKey: 'channel', header: 'Channel' },
  { accessorKey: 'spend', header: 'Spend' },
  { accessorKey: 'sessions', header: 'Sessions' },
  { accessorKey: 'keyEvents', header: 'GA4 key events' },
  { accessorKey: 'leads', header: 'Leads' },
  { accessorKey: 'costPerLead', header: 'Cost / lead' }
]

function fmtRatio(v: number | null): string {
  return v === null ? '—' : fmtCurrency(v)
}
</script>

<template>
  <UCard v-if="!pending && data?.hasGa4">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-filter" class="text-primary" />
        <span class="font-semibold">Website &amp; Funnel</span>
        <UTooltip text="GA4 key events are the on-site conversion signal; Leads are captured ground truth. They won't match exactly.">
          <UIcon name="i-lucide-info" class="text-muted" />
        </UTooltip>
      </div>
    </template>

    <!-- Top-line funnel stages -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Ad spend</p>
        <p class="text-xl font-semibold">{{ fmtCurrency(data!.totals.spend) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Sessions</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.sessions) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">GA4 key events</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.keyEvents) }}</p>
      </div>
      <div class="rounded-lg bg-elevated p-4">
        <p class="text-xs text-muted">Leads</p>
        <p class="text-xl font-semibold">{{ fmtCompact(data!.totals.leads) }}</p>
      </div>
    </div>

    <UTable :data="data!.channels" :columns="columns">
      <template #spend-cell="{ row }">{{ fmtCurrency(row.original.spend) }}</template>
      <template #sessions-cell="{ row }">{{ fmtCompact(row.original.sessions) }}</template>
      <template #keyEvents-cell="{ row }">{{ fmtCompact(row.original.keyEvents) }}</template>
      <template #leads-cell="{ row }">{{ fmtCompact(row.original.leads) }}</template>
      <template #costPerLead-cell="{ row }">{{ fmtRatio(row.original.costPerLead) }}</template>
    </UTable>
  </UCard>
</template>
```

- [ ] **Step 2: Render it on the portal analytics page**

In `app/pages/portal/analytics/index.vue`, add to the template (after the existing trends/overview sections), passing the page's existing date-range refs (the page already computes `thirtyDaysAgo`/`now` and a `formatDateISO` helper — reuse those, or the existing start/end refs if present):

```vue
    <PortalFunnelChart
      :start-date="formatDateISO(thirtyDaysAgo)"
      :end-date="formatDateISO(now)"
      class="mt-6"
    />
```

- [ ] **Step 3: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep -iE "FunnelChart|portal/analytics/index" || echo "portal funnel UI OK"`
Expected: `portal funnel UI OK`. (Confirm `useAnalytics()` exposes `fmtCurrency`/`fmtCompact` — it's already imported at the top of `index.vue`.)

- [ ] **Step 4: Commit**

```bash
git add app/components/portal/FunnelChart.client.vue app/pages/portal/analytics/index.vue
git commit -m "feat(ga4): portal Website & Funnel section"
```

---

## Task 17: Marketing site sync

**Files:**
- Modify: `app/pages/features/index.vue` (add a feature entry under the analytics/reporting category)
- Modify: `app/pages/features/[slug].vue` (add a detailed `ga4-funnel` entry with 3-4 sections)
- Modify: `app/components/MarketingNav.vue` (add to the analytics mega-menu group if one exists)

**Context:** Per `CLAUDE.md`'s "Front-Facing Page Sync" rule. Match the existing data structure each file already uses — open each file, find the array/object of features, and add an entry with the same shape as its neighbours. Do not invent a new structure.

- [ ] **Step 1: Add the features/index.vue entry**

Find the analytics/reporting category array in `app/pages/features/index.vue` and add an item matching the existing shape, e.g.:

```ts
{
  slug: 'ga4-funnel',
  title: 'GA4 Funnel & Website Analytics',
  description: 'Connect Google Analytics 4 and see the full funnel — ad spend through sessions, on-site conversions, and captured leads, attributed by channel.',
  icon: 'i-lucide-filter'
}
```

- [ ] **Step 2: Add the [slug].vue detail entry**

In `app/pages/features/[slug].vue`, add a `ga4-funnel` key to the feature-detail map with 3-4 content sections (match the neighbouring entries' shape):

```ts
'ga4-funnel': {
  title: 'GA4 Funnel & Website Analytics',
  subtitle: 'Close the loop from ad spend to on-site outcomes.',
  sections: [
    { heading: 'One funnel, every channel', body: 'We pull Google Analytics 4 alongside your Meta and Google ad spend and line them up by channel: spend → sessions → key events → captured leads.' },
    { heading: 'Channel-level attribution', body: 'Paid Search and Paid Social map straight onto GA4 channel groups, so you see cost per session, cost per key event, and cost per lead without fragile UTM wrangling.' },
    { heading: 'Signal vs ground truth', body: 'GA4 key events show on-site conversion signal; your captured leads show what actually landed in the inbox. We show both side by side so nothing hides.' },
    { heading: 'Always current', body: 'A daily sync refreshes the last two weeks to absorb GA4 reprocessing, so the client report is never stale.' }
  ]
}
```

- [ ] **Step 3: Add to MarketingNav (if an analytics group exists)**

In `app/components/MarketingNav.vue`, add a link to the analytics/reporting mega-menu group matching the existing item shape:

```ts
{ label: 'GA4 Funnel', to: '/features/ga4-funnel' }
```

- [ ] **Step 4: Verify it builds**

Run: `pnpm exec nuxi typecheck 2>&1 | grep -iE "features/|MarketingNav" || echo "marketing sync OK"`
Expected: `marketing sync OK`.

- [ ] **Step 5: Commit**

```bash
git add app/pages/features/index.vue app/pages/features/[slug].vue app/components/MarketingNav.vue
git commit -m "docs(marketing): add GA4 funnel feature to public site"
```

---

## Task 18: Full verification

- [ ] **Step 1: Run the full unit test suite**

Run: `pnpm exec vitest run test/utils/channelMap.test.ts test/utils/ga4Client.test.ts test/utils/ga4Funnel.test.ts`
Expected: all PASS (3 files, 14 assertions total).

- [ ] **Step 2: Typecheck the whole project**

Run: `pnpm exec nuxi typecheck 2>&1 | tail -20`
Expected: no NEW errors referencing any `ga4`/`channelMap`/`funnel` file (pre-existing ~60 `index.d.ts` errors are known and acceptable per CLAUDE.md).

- [ ] **Step 3: Smoke-test the dev server boots**

Run: `pnpm dev` (in a separate terminal) and confirm Nitro builds without errors mentioning the new endpoints; then stop it.
Expected: `Nuxt Nitro server built` with no GA4-related errors.

- [ ] **Step 4: Final commit (if any verification fixups were made)**

```bash
git add -A
git commit -m "chore(ga4): verification fixups" || echo "nothing to commit"
```

---

## Self-review notes (addressed during authoring)

- **Spec coverage:** connection/auth (T2,T5,T6), property mapping (T1,T7,T8), dedicated tables not media_spend (T1), sync util + cron + manual (T9,T10,T11), channel-level funnel join with leads ground truth (T3,T12,T13,T14), portal + agency surfacing with graceful degradation via `hasGa4` (T15,T16), marketing sync (T17), testing (T3,T4,T12,T18). All spec sections mapped.
- **Type consistency:** `GA4_METRICS` order is the request↔parser contract (T4); `Ga4ReportRow`/`FunnelChannelRow`/`FunnelInput` names are reused verbatim across T4/T9/T12/T13/T14; SQL channel CASE statements match `channelMap.ts` (T3) exactly.
- **Graceful degradation:** portal section renders only when `hasGa4` is true (T16), so clients without GA4 see the unchanged spend report.
- **Known follow-ups (out of scope):** UTM/campaign-grain attribution; top pages/geo/device; reconciling `purchase_revenue` against Xero.
