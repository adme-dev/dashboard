# Dealer Feeds — P1a XeroFlow Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the XeroFlow-side foundation of the automotive dealer feeds plugin — the `FeedProvider` contract, a service-authed REST client to social-dashboard, the `social-dashboard` provider, the client↔dealer mapping, and config/flag wiring — all unit-tested with social-dashboard mocked.

**Architecture:** A pluggable `FeedProvider` interface (`server/utils/feeds/`) is the plugin boundary; `socialDashboard` is provider #1. It calls social-dashboard over REST using a service secret + asserted-org headers (the seam P1b implements). Pure normalizers convert social-dashboard's shapes to XeroFlow DTOs. No AI tools, no cron, no UI in P1a — those are P2/P3.

**Tech Stack:** Nuxt 4 / Nitro, TypeScript, Neon Postgres (`server/utils/db.ts`), Vitest. Dependency injection (injected `fetch`/`query` fns) keeps everything unit-testable without network or DB.

## Global Constraints

- Server imports use `~~/server/utils/` (Nitro double-tilde), never `~/server/utils/`.
- Tests are Vitest; run a single file with `pnpm exec vitest run <path>`.
- DB access via `queryOne`/`queryRows`/`execute` from `~~/server/utils/db`. Migrations live in `server/database/migrations/`, are additive, and are applied to live Neon via `psql "$DATABASE_URL" -f <file>` (load `DATABASE_URL` from `.env`).
- Feature flag `DEALER_FEEDS_ENABLED` (default off). Service secret `SOCIAL_DASHBOARD_SERVICE_SECRET` lives in env only, never in DB or code.
- The whole feature is provider-agnostic: code in `server/utils/feeds/` must not hardcode social-dashboard specifics outside `providers/socialDashboard.ts` and `socialDashboardClient.ts`.
- Pure functions over I/O: keep normalizers and mappers side-effect-free and inject `fetch`/query callbacks so units test without network/DB.
- Migration numbering: use the next free integer. As of this writing `205_*` is taken by the unmerged `feat/brief-monday-campaign-mapping` branch, so this plan uses `206`; if 206 is taken at execution time, bump to the next free number and keep the suffix.

## REST contract with social-dashboard (the P1a↔P1b seam)

P1a calls these; P1b (separate plan) implements the service-auth + the new `search-inventory` endpoint. All requests carry headers: `x-feed-service-secret`, `x-feed-acting-user`, `x-feed-org-id`. Org scoping is derived server-side from `x-feed-org-id`.

| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/feeds?type=<google\|facebook>` | — | `{ ok, items: RawFeed[] }` |
| GET | `/api/feeds/{id}` | — | `{ ok, item: RawFeed }` |
| GET | `/api/feeds/{id}/preview?limit&offset` | — | `{ ok, total, items: RawVehicle[] }` |
| POST | `/api/feeds/search-inventory` (NEW) | `{ sellerRefs, filters }` | `{ ok, total, items: RawVehicle[] }` |
| POST | `/api/feeds` | `{ name, feed_type, filters, mappings, source? }` | `{ ok, id }` |
| PATCH | `/api/feeds/{id}` | `{ ...patch }` | `{ ok, updated }` |
| POST | `/api/feeds/generate` | `{ feedId, format }` | `{ ok, url, itemCount }` |
| GET | `/api/feeds/{id}/metrics` | — | `{ ok, inventory, active, issues }` |

`RawFeed = { id, name, feed_type, is_active, filters?, mappings?, source? }`. `RawVehicle` = social-dashboard's normalized vehicle (`id, make, model, build_year, dap_price, listing_type, stock_number, url, images[]`, …).

---

## File structure (P1a)

- `server/utils/feeds/types.ts` — interfaces/DTOs (no logic).
- `server/utils/feeds/normalize.ts` — pure `RawFeed`/`RawVehicle` → DTO mappers.
- `server/utils/feeds/socialDashboardClient.ts` — service-auth header builder + DI-fetch REST client.
- `server/utils/feeds/providers/socialDashboard.ts` — `FeedProvider` impl over the client + normalizers.
- `server/utils/feeds/registry.ts` — `id → FeedProvider` lookup.
- `server/utils/feeds/dealerLinks.ts` — pure `rowToDealerLink` + thin `getDealerLink` (DB).
- `server/utils/feeds/config.ts` — `isDealerFeedsEnabled()` + `loadSocialDashboardConfig()`.
- `server/database/migrations/206_dealer_feed_links.sql` — `client_feed_links` table.
- Tests under `test/feeds/`.

---

### Task 1: `client_feed_links` migration

**Files:**
- Create: `server/database/migrations/206_dealer_feed_links.sql`
- Test: manual verification query (infra task)

**Interfaces:**
- Produces: table `client_feed_links (id, client_id, provider_id, external_org_id, seller_refs jsonb, default_feed_ids jsonb, status, created_by, created_at, updated_at)`, unique `(client_id, provider_id)`.

- [ ] **Step 1: Write the migration**

```sql
-- 206: client ↔ external dealer-feed provider links (dealer feeds plugin P1a)
-- Maps a XeroFlow agency_client to a social-dashboard organization (feed ownership)
-- plus seller refs (inventory queries). Additive + idempotent.

CREATE TABLE IF NOT EXISTS client_feed_links (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        uuid NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  provider_id      varchar(50) NOT NULL DEFAULT 'social-dashboard',
  external_org_id  varchar(255) NOT NULL,
  seller_refs      jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_feed_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           varchar(20) NOT NULL DEFAULT 'active',
  created_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS client_feed_links_client_provider_key
  ON client_feed_links (client_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_client_feed_links_client ON client_feed_links (client_id);
```

- [ ] **Step 2: Apply to live Neon**

Run:
```bash
export DATABASE_URL=$(grep '^DATABASE_URL=' .env | cut -d= -f2-)
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f server/database/migrations/206_dealer_feed_links.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` (no error).

- [ ] **Step 3: Verify the table shape**

Run:
```bash
psql "$DATABASE_URL" -P pager=off -c "\d client_feed_links"
```
Expected: columns `id, client_id, provider_id, external_org_id, seller_refs, default_feed_ids, status, created_by, created_at, updated_at`; unique index on `(client_id, provider_id)`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/206_dealer_feed_links.sql
git commit -m "feat(feeds): client_feed_links table (dealer feeds P1a)"
```

---

### Task 2: Types + pure normalizers

**Files:**
- Create: `server/utils/feeds/types.ts`
- Create: `server/utils/feeds/normalize.ts`
- Test: `test/feeds/normalize.test.ts`

**Interfaces:**
- Produces: `FeedPlatform`, `FeedRef`, `DealerLink`, `FeedSummary`, `FeedDetail`, `VehicleSummary`, `FeedMetrics`, `FeedProviderContext`, `CreateFeedSpec`, `FeedProvider`; `normalizeFeedSummary(raw)`, `normalizeFeedDetail(raw)`, `normalizeVehicle(raw)`.

- [ ] **Step 1: Write `types.ts`**

```ts
// server/utils/feeds/types.ts
// Provider-agnostic contract for the dealer feeds plugin. social-dashboard is
// provider #1; future direct providers (autogate/carloop) implement FeedProvider.

export type FeedPlatform = 'google' | 'facebook'

export interface FeedRef { providerId: string; feedId: string; platform: FeedPlatform }

export interface DealerLink {
  clientId: string
  providerId: string
  externalOrgId: string        // social-dashboard organization_id (feed ownership)
  sellerRefs: string[]         // social-dashboard seller_id / dealership_slug (inventory)
  defaultFeedIds: string[]
}

export interface FeedSummary { id: string; name: string; platform: FeedPlatform; isActive: boolean }
export interface FeedDetail extends FeedSummary {
  filters: Record<string, unknown>
  mappings: Record<string, unknown>
  source: Record<string, unknown> | null
}

export interface VehicleSummary {
  id: string
  make: string
  model: string
  year: number | null
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  image: string | null
}

export interface FeedMetrics { inventory: number; active: number; issues: number; fetchedAt: string }

/** Asserted identity passed to the provider on every call (becomes the service-auth headers). */
export interface FeedProviderContext { actingUserEmail: string; externalOrgId: string }

export interface CreateFeedSpec {
  name: string
  platform: FeedPlatform
  filters?: Record<string, unknown>
  mappings?: Record<string, unknown>
  source?: Record<string, unknown>
}

export interface FeedProvider {
  id: string
  label: string
  listFeeds(ctx: FeedProviderContext, link: DealerLink): Promise<FeedSummary[]>
  getFeed(ctx: FeedProviderContext, ref: FeedRef): Promise<FeedDetail>
  previewFeed(ctx: FeedProviderContext, ref: FeedRef, opts: { limit?: number; offset?: number }): Promise<{ total: number; items: VehicleSummary[] }>
  searchInventory(ctx: FeedProviderContext, link: DealerLink, filters: Record<string, unknown>): Promise<{ total: number; items: VehicleSummary[] }>
  createFeed(ctx: FeedProviderContext, link: DealerLink, spec: CreateFeedSpec): Promise<FeedRef>
  updateFeed(ctx: FeedProviderContext, ref: FeedRef, patch: Record<string, unknown>): Promise<void>
  generateFeed(ctx: FeedProviderContext, ref: FeedRef, format: 'xml' | 'csv'): Promise<{ url: string; itemCount: number }>
  getMetrics(ctx: FeedProviderContext, ref: FeedRef): Promise<FeedMetrics>
}
```

- [ ] **Step 2: Write the failing normalizer test**

```ts
// test/feeds/normalize.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from '~~/server/utils/feeds/normalize'

describe('normalizeFeedSummary', () => {
  it('maps feed_type to platform and defaults is_active', () => {
    expect(normalizeFeedSummary({ id: 7, name: 'GWM Google', feed_type: 'google', is_active: true }))
      .toEqual({ id: '7', name: 'GWM Google', platform: 'google', isActive: true })
    expect(normalizeFeedSummary({ id: '9', name: 'X', feed_type: 'facebook' }).platform).toBe('facebook')
    expect(normalizeFeedSummary({ id: '9', name: 'X', feed_type: 'google', is_active: false }).isActive).toBe(false)
  })
})

describe('normalizeVehicle', () => {
  it('maps social-dashboard vehicle shape to VehicleSummary, first image, dap_price', () => {
    const v = normalizeVehicle({ id: 'v1', make: 'Kia', model: 'Sportage', build_year: 2024, dap_price: 41990, listing_type: 'demo', stock_number: 'K123', url: 'https://x', images: ['a.jpg', 'b.jpg'] })
    expect(v).toEqual({ id: 'v1', make: 'Kia', model: 'Sportage', year: 2024, price: 41990, condition: 'demo', stockNumber: 'K123', url: 'https://x', image: 'a.jpg' })
  })
  it('falls back to year/price/image scalars and nulls missing fields', () => {
    const v = normalizeVehicle({ id: 2, make: 'Ford', model: 'Ranger', year: 2023, price: 60000, image: 'one.jpg' })
    expect(v.year).toBe(2023); expect(v.price).toBe(60000); expect(v.image).toBe('one.jpg')
    expect(normalizeVehicle({ id: 3, make: 'X', model: 'Y' }).image).toBeNull()
  })
})

describe('normalizeFeedDetail', () => {
  it('extends summary with filters/mappings/source', () => {
    const d = normalizeFeedDetail({ id: '1', name: 'F', feed_type: 'google', is_active: true, filters: { a: 1 }, mappings: {}, source: { type: 'meilisearch' } })
    expect(d.platform).toBe('google'); expect(d.filters).toEqual({ a: 1 }); expect(d.source).toEqual({ type: 'meilisearch' })
    expect(normalizeFeedDetail({ id: '1', name: 'F', feed_type: 'google' }).source).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run test/feeds/normalize.test.ts`
Expected: FAIL — cannot resolve `~~/server/utils/feeds/normalize`.

- [ ] **Step 4: Write `normalize.ts`**

```ts
// server/utils/feeds/normalize.ts
import type { FeedSummary, FeedDetail, VehicleSummary, FeedPlatform } from './types'

function platformOf(raw: any): FeedPlatform {
  return raw?.feed_type === 'facebook' ? 'facebook' : 'google'
}

export function normalizeFeedSummary(raw: any): FeedSummary {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    platform: platformOf(raw),
    isActive: raw.is_active !== false,
  }
}

export function normalizeFeedDetail(raw: any): FeedDetail {
  return {
    ...normalizeFeedSummary(raw),
    filters: (raw.filters ?? {}) as Record<string, unknown>,
    mappings: (raw.mappings ?? {}) as Record<string, unknown>,
    source: (raw.source ?? null) as Record<string, unknown> | null,
  }
}

function num(...vals: unknown[]): number | null {
  for (const v of vals) {
    if (v === null || v === undefined || v === '') continue
    const n = Number(v)
    if (!Number.isNaN(n)) return n
  }
  return null
}

export function normalizeVehicle(raw: any): VehicleSummary {
  const image = Array.isArray(raw.images) ? (raw.images[0] ?? null) : (raw.image ?? null)
  return {
    id: String(raw.id ?? ''),
    make: String(raw.make ?? ''),
    model: String(raw.model ?? ''),
    year: num(raw.build_year, raw.year),
    price: num(raw.dap_price, raw.price),
    condition: raw.listing_type ?? raw.condition ?? null,
    stockNumber: raw.stock_number ?? null,
    url: raw.url ?? null,
    image: image ?? null,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/feeds/normalize.test.ts`
Expected: PASS (3 suites).

- [ ] **Step 6: Commit**

```bash
git add server/utils/feeds/types.ts server/utils/feeds/normalize.ts test/feeds/normalize.test.ts
git commit -m "feat(feeds): FeedProvider types + pure normalizers"
```

---

### Task 3: Service-auth headers + `socialDashboardClient`

**Files:**
- Create: `server/utils/feeds/socialDashboardClient.ts`
- Test: `test/feeds/socialDashboardClient.test.ts`

**Interfaces:**
- Consumes: `FeedProviderContext` (Task 2).
- Produces: `buildServiceHeaders(ctx, secret)`; `createSocialDashboardClient(cfg)` → `{ call<T>(ctx, method, path, body?) }`; type `SocialDashboardClientConfig { baseUrl; serviceSecret; fetchImpl? }`.

- [ ] **Step 1: Write the failing test**

```ts
// test/feeds/socialDashboardClient.test.ts
import { describe, it, expect, vi } from 'vitest'
import { buildServiceHeaders, createSocialDashboardClient } from '~~/server/utils/feeds/socialDashboardClient'

const ctx = { actingUserEmail: 'paul@adme.net.au', externalOrgId: 'org-123' }

describe('buildServiceHeaders', () => {
  it('sets the service secret + asserted identity headers', () => {
    expect(buildServiceHeaders(ctx, 'sekret')).toEqual({
      'content-type': 'application/json',
      'x-feed-service-secret': 'sekret',
      'x-feed-acting-user': 'paul@adme.net.au',
      'x-feed-org-id': 'org-123',
    })
  })
})

describe('createSocialDashboardClient.call', () => {
  it('strips a trailing slash, sends headers + JSON body, returns parsed json', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, id: 'f1' }), { status: 200 }))
    const client = createSocialDashboardClient({ baseUrl: 'https://sd.example/', serviceSecret: 'sekret', fetchImpl: fetchImpl as any })
    const out = await client.call(ctx, 'POST', '/api/feeds', { name: 'X' })
    expect(out).toEqual({ ok: true, id: 'f1' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://sd.example/api/feeds')
    expect((init as any).method).toBe('POST')
    expect((init as any).headers['x-feed-service-secret']).toBe('sekret')
    expect((init as any).body).toBe(JSON.stringify({ name: 'X' }))
  })

  it('omits the body for GET and throws a descriptive error on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 }))
    const client = createSocialDashboardClient({ baseUrl: 'https://sd.example', serviceSecret: 's', fetchImpl: fetchImpl as any })
    await expect(client.call(ctx, 'GET', '/api/feeds')).rejects.toThrow(/GET \/api\/feeds → 403: nope/)
    expect((fetchImpl.mock.calls[0][1] as any).body).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/feeds/socialDashboardClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `socialDashboardClient.ts`**

```ts
// server/utils/feeds/socialDashboardClient.ts
import type { FeedProviderContext } from './types'

export interface SocialDashboardClientConfig {
  baseUrl: string
  serviceSecret: string
  fetchImpl?: typeof fetch
}

export function buildServiceHeaders(ctx: FeedProviderContext, serviceSecret: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-feed-service-secret': serviceSecret,
    'x-feed-acting-user': ctx.actingUserEmail,
    'x-feed-org-id': ctx.externalOrgId,
  }
}

export function createSocialDashboardClient(cfg: SocialDashboardClientConfig) {
  const doFetch = cfg.fetchImpl ?? fetch
  const base = cfg.baseUrl.replace(/\/+$/, '')

  async function call<T>(ctx: FeedProviderContext, method: string, path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: buildServiceHeaders(ctx, cfg.serviceSecret),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`social-dashboard ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`)
    }
    return res.json() as Promise<T>
  }

  return { call }
}

export type SocialDashboardClient = ReturnType<typeof createSocialDashboardClient>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/feeds/socialDashboardClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/feeds/socialDashboardClient.ts test/feeds/socialDashboardClient.test.ts
git commit -m "feat(feeds): service-auth REST client for social-dashboard"
```

---

### Task 4: `socialDashboard` provider + registry

**Files:**
- Create: `server/utils/feeds/providers/socialDashboard.ts`
- Create: `server/utils/feeds/registry.ts`
- Test: `test/feeds/socialDashboardProvider.test.ts`

**Interfaces:**
- Consumes: `SocialDashboardClient` (Task 3), normalizers + types (Task 2).
- Produces: `createSocialDashboardProvider(client): FeedProvider`; `registry.ts` exports `getFeedProvider(id, client?)` and `SOCIAL_DASHBOARD_PROVIDER_ID = 'social-dashboard'`.

- [ ] **Step 1: Write the failing test**

```ts
// test/feeds/socialDashboardProvider.test.ts
import { describe, it, expect, vi } from 'vitest'
import { createSocialDashboardProvider } from '~~/server/utils/feeds/providers/socialDashboard'
import type { DealerLink, FeedRef, FeedProviderContext } from '~~/server/utils/feeds/types'

const ctx: FeedProviderContext = { actingUserEmail: 'p@x', externalOrgId: 'org-1' }
const link: DealerLink = { clientId: 'c1', providerId: 'social-dashboard', externalOrgId: 'org-1', sellerRefs: ['kia-springvale'], defaultFeedIds: [] }
const ref: FeedRef = { providerId: 'social-dashboard', feedId: 'f1', platform: 'google' }

function fakeClient(responses: Record<string, any>) {
  const call = vi.fn(async (_ctx, method: string, path: string) => responses[`${method} ${path}`])
  return { client: { call }, call }
}

describe('socialDashboard provider', () => {
  it('listFeeds normalizes the items array', async () => {
    const { client } = fakeClient({ 'GET /api/feeds?type=google': { ok: true, items: [{ id: 1, name: 'A', feed_type: 'google', is_active: true }] } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.listFeeds(ctx, link)
    expect(out).toEqual([{ id: '1', name: 'A', platform: 'google', isActive: true }])
  })

  it('searchInventory posts sellerRefs+filters and normalizes vehicles', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds/search-inventory': { ok: true, total: 1, items: [{ id: 'v1', make: 'Kia', model: 'EV5', build_year: 2025, dap_price: 56990, images: ['x.jpg'] }] } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.searchInventory(ctx, link, { makes: ['Kia'] })
    expect(out.total).toBe(1)
    expect(out.items[0]).toMatchObject({ id: 'v1', make: 'Kia', price: 56990, image: 'x.jpg' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds/search-inventory', { sellerRefs: ['kia-springvale'], filters: { makes: ['Kia'] } })
  })

  it('createFeed returns a FeedRef from the new id', async () => {
    const { client, call } = fakeClient({ 'POST /api/feeds': { ok: true, id: 'new9' } })
    const p = createSocialDashboardProvider(client as any)
    const out = await p.createFeed(ctx, link, { name: 'New', platform: 'facebook', filters: { a: 1 } })
    expect(out).toEqual({ providerId: 'social-dashboard', feedId: 'new9', platform: 'facebook' })
    expect(call).toHaveBeenCalledWith(ctx, 'POST', '/api/feeds', { name: 'New', feed_type: 'facebook', filters: { a: 1 }, mappings: {}, source: undefined })
  })

  it('generateFeed returns url + itemCount', async () => {
    const { client } = fakeClient({ 'POST /api/feeds/generate': { ok: true, url: 'https://feed.xml', itemCount: 42 } })
    const p = createSocialDashboardProvider(client as any)
    expect(await p.generateFeed(ctx, ref, 'xml')).toEqual({ url: 'https://feed.xml', itemCount: 42 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/feeds/socialDashboardProvider.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `providers/socialDashboard.ts`**

```ts
// server/utils/feeds/providers/socialDashboard.ts
import type { SocialDashboardClient } from '../socialDashboardClient'
import { normalizeFeedSummary, normalizeFeedDetail, normalizeVehicle } from '../normalize'
import type {
  FeedProvider, FeedProviderContext, DealerLink, FeedRef, CreateFeedSpec,
} from '../types'

export const SOCIAL_DASHBOARD_PROVIDER_ID = 'social-dashboard'

export function createSocialDashboardProvider(client: SocialDashboardClient): FeedProvider {
  return {
    id: SOCIAL_DASHBOARD_PROVIDER_ID,
    label: 'Social Dashboard (Vehicle Feed Platform)',

    async listFeeds(ctx, _link) {
      const r = await client.call<{ items?: any[] }>(ctx, 'GET', `/api/feeds?type=google`)
      return (r.items ?? []).map(normalizeFeedSummary)
    },

    async getFeed(ctx, ref: FeedRef) {
      const r = await client.call<{ item: any }>(ctx, 'GET', `/api/feeds/${ref.feedId}`)
      return normalizeFeedDetail(r.item)
    },

    async previewFeed(ctx, ref: FeedRef, opts) {
      const q = `?limit=${opts.limit ?? 20}&offset=${opts.offset ?? 0}`
      const r = await client.call<{ total?: number; items?: any[] }>(ctx, 'GET', `/api/feeds/${ref.feedId}/preview${q}`)
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async searchInventory(ctx, link: DealerLink, filters) {
      const r = await client.call<{ total?: number; items?: any[] }>(ctx, 'POST', `/api/feeds/search-inventory`, { sellerRefs: link.sellerRefs, filters })
      return { total: r.total ?? 0, items: (r.items ?? []).map(normalizeVehicle) }
    },

    async createFeed(ctx, _link: DealerLink, spec: CreateFeedSpec): Promise<FeedRef> {
      const r = await client.call<{ id: string }>(ctx, 'POST', `/api/feeds`, {
        name: spec.name,
        feed_type: spec.platform,
        filters: spec.filters ?? {},
        mappings: spec.mappings ?? {},
        source: spec.source,
      })
      return { providerId: SOCIAL_DASHBOARD_PROVIDER_ID, feedId: String(r.id), platform: spec.platform }
    },

    async updateFeed(ctx, ref: FeedRef, patch) {
      await client.call(ctx, 'PATCH', `/api/feeds/${ref.feedId}`, patch)
    },

    async generateFeed(ctx, ref: FeedRef, format) {
      const r = await client.call<{ url: string; itemCount: number }>(ctx, 'POST', `/api/feeds/generate`, { feedId: ref.feedId, format })
      return { url: r.url, itemCount: r.itemCount }
    },

    async getMetrics(ctx, ref: FeedRef) {
      const r = await client.call<{ inventory?: number; active?: number; issues?: number }>(ctx, 'GET', `/api/feeds/${ref.feedId}/metrics`)
      return { inventory: r.inventory ?? 0, active: r.active ?? 0, issues: r.issues ?? 0, fetchedAt: new Date().toISOString() }
    },
  }
}
```

> Note: `getMetrics` stamps `fetchedAt` from `new Date()` — acceptable in runtime code (only the workflow-script sandbox forbids `Date`). It is not asserted in the unit test.

- [ ] **Step 4: Write `registry.ts`**

```ts
// server/utils/feeds/registry.ts
import type { FeedProvider } from './types'
import type { SocialDashboardClient } from './socialDashboardClient'
import { createSocialDashboardProvider, SOCIAL_DASHBOARD_PROVIDER_ID } from './providers/socialDashboard'

export { SOCIAL_DASHBOARD_PROVIDER_ID }

/** Resolve a provider by id. The social-dashboard provider needs a client injected by the caller. */
export function getFeedProvider(id: string, deps: { socialDashboardClient?: SocialDashboardClient } = {}): FeedProvider {
  if (id === SOCIAL_DASHBOARD_PROVIDER_ID) {
    if (!deps.socialDashboardClient) throw new Error('social-dashboard provider requires a client')
    return createSocialDashboardProvider(deps.socialDashboardClient)
  }
  throw new Error(`unknown feed provider: ${id}`)
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run test/feeds/socialDashboardProvider.test.ts`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add server/utils/feeds/providers/socialDashboard.ts server/utils/feeds/registry.ts test/feeds/socialDashboardProvider.test.ts
git commit -m "feat(feeds): social-dashboard provider + registry"
```

---

### Task 5: Dealer-link mapping (`dealerLinks.ts`)

**Files:**
- Create: `server/utils/feeds/dealerLinks.ts`
- Test: `test/feeds/dealerLinks.test.ts`

**Interfaces:**
- Consumes: `DealerLink` (Task 2); `queryOne` from `~~/server/utils/db` (only in the thin DB fn).
- Produces: pure `rowToDealerLink(row): DealerLink`; `getDealerLink(clientId, providerId?, deps?): Promise<DealerLink | null>` (deps injects a `queryOne` for testability).

- [ ] **Step 1: Write the failing test**

```ts
// test/feeds/dealerLinks.test.ts
import { describe, it, expect, vi } from 'vitest'
import { rowToDealerLink, getDealerLink } from '~~/server/utils/feeds/dealerLinks'

const row = {
  client_id: 'c1', provider_id: 'social-dashboard', external_org_id: 'org-9',
  seller_refs: ['kia-springvale', 'kia-frankston'], default_feed_ids: ['f1'],
}

describe('rowToDealerLink', () => {
  it('maps a DB row to a DealerLink', () => {
    expect(rowToDealerLink(row)).toEqual({
      clientId: 'c1', providerId: 'social-dashboard', externalOrgId: 'org-9',
      sellerRefs: ['kia-springvale', 'kia-frankston'], defaultFeedIds: ['f1'],
    })
  })
  it('coerces null jsonb arrays to []', () => {
    const l = rowToDealerLink({ ...row, seller_refs: null, default_feed_ids: null })
    expect(l.sellerRefs).toEqual([]); expect(l.defaultFeedIds).toEqual([])
  })
})

describe('getDealerLink', () => {
  it('returns null when no row', async () => {
    const queryOne = vi.fn(async () => null)
    expect(await getDealerLink('c1', 'social-dashboard', { queryOne: queryOne as any })).toBeNull()
  })
  it('maps the row and passes clientId + providerId as params', async () => {
    const queryOne = vi.fn(async () => row)
    const out = await getDealerLink('c1', 'social-dashboard', { queryOne: queryOne as any })
    expect(out?.externalOrgId).toBe('org-9')
    expect(queryOne).toHaveBeenCalledWith(expect.stringContaining('client_feed_links'), ['c1', 'social-dashboard'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/feeds/dealerLinks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `dealerLinks.ts`**

```ts
// server/utils/feeds/dealerLinks.ts
import { queryOne as dbQueryOne } from '~~/server/utils/db'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './registry'
import type { DealerLink } from './types'

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : []
}

export function rowToDealerLink(row: any): DealerLink {
  return {
    clientId: String(row.client_id),
    providerId: String(row.provider_id),
    externalOrgId: String(row.external_org_id),
    sellerRefs: asStringArray(row.seller_refs),
    defaultFeedIds: asStringArray(row.default_feed_ids),
  }
}

/** deps.queryOne is injected in tests; defaults to the real db helper at runtime. */
export async function getDealerLink(
  clientId: string,
  providerId: string = SOCIAL_DASHBOARD_PROVIDER_ID,
  deps: { queryOne?: typeof dbQueryOne } = {},
): Promise<DealerLink | null> {
  const queryOne = deps.queryOne ?? dbQueryOne
  const row = await queryOne(
    `SELECT client_id, provider_id, external_org_id, seller_refs, default_feed_ids
     FROM client_feed_links WHERE client_id = $1 AND provider_id = $2 AND status = 'active'`,
    [clientId, providerId],
  )
  return row ? rowToDealerLink(row) : null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/feeds/dealerLinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/feeds/dealerLinks.ts test/feeds/dealerLinks.test.ts
git commit -m "feat(feeds): client↔dealer link mapping"
```

---

### Task 6: Config + flag wiring (`config.ts`)

**Files:**
- Create: `server/utils/feeds/config.ts`
- Test: `test/feeds/config.test.ts`

**Interfaces:**
- Consumes: `queryOne` from `~~/server/utils/db` (thin DB fn, injected in tests); `createSocialDashboardClient` (Task 3).
- Produces: `isDealerFeedsEnabled(env?)`; `loadSocialDashboardConfig(deps?)` → `{ baseUrl, serviceSecret } | null`; `getSocialDashboardClient(deps?)` → `SocialDashboardClient | null`.

- [ ] **Step 1: Write the failing test**

```ts
// test/feeds/config.test.ts
import { describe, it, expect, vi } from 'vitest'
import { isDealerFeedsEnabled, loadSocialDashboardConfig } from '~~/server/utils/feeds/config'

describe('isDealerFeedsEnabled', () => {
  it('is true only for the string "true"', () => {
    expect(isDealerFeedsEnabled({ DEALER_FEEDS_ENABLED: 'true' })).toBe(true)
    expect(isDealerFeedsEnabled({ DEALER_FEEDS_ENABLED: 'false' })).toBe(false)
    expect(isDealerFeedsEnabled({})).toBe(false)
  })
})

describe('loadSocialDashboardConfig', () => {
  it('returns null when the secret is missing', async () => {
    const queryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd' } }))
    expect(await loadSocialDashboardConfig({ env: {}, queryOne: queryOne as any })).toBeNull()
  })
  it('returns null when no integration row / baseUrl', async () => {
    const queryOne = vi.fn(async () => null)
    expect(await loadSocialDashboardConfig({ env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's' }, queryOne: queryOne as any })).toBeNull()
  })
  it('returns baseUrl + secret when both present', async () => {
    const queryOne = vi.fn(async () => ({ settings: { baseUrl: 'https://sd.example' } }))
    const cfg = await loadSocialDashboardConfig({ env: { SOCIAL_DASHBOARD_SERVICE_SECRET: 's' }, queryOne: queryOne as any })
    expect(cfg).toEqual({ baseUrl: 'https://sd.example', serviceSecret: 's' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/feeds/config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `config.ts`**

```ts
// server/utils/feeds/config.ts
import { queryOne as dbQueryOne } from '~~/server/utils/db'
import { createSocialDashboardClient, type SocialDashboardClient } from './socialDashboardClient'
import { SOCIAL_DASHBOARD_PROVIDER_ID } from './registry'

type Env = Record<string, string | undefined>

export function isDealerFeedsEnabled(env: Env = process.env): boolean {
  return env.DEALER_FEEDS_ENABLED === 'true'
}

export interface SocialDashboardConfig { baseUrl: string; serviceSecret: string }

export async function loadSocialDashboardConfig(
  deps: { env?: Env; queryOne?: typeof dbQueryOne } = {},
): Promise<SocialDashboardConfig | null> {
  const env = deps.env ?? process.env
  const serviceSecret = env.SOCIAL_DASHBOARD_SERVICE_SECRET
  if (!serviceSecret) return null
  const queryOne = deps.queryOne ?? dbQueryOne
  const row = await queryOne(
    `SELECT settings FROM integration_configs WHERE integration_type = $1`,
    [SOCIAL_DASHBOARD_PROVIDER_ID],
  )
  const baseUrl = (row?.settings as any)?.baseUrl
  if (!baseUrl) return null
  return { baseUrl: String(baseUrl), serviceSecret }
}

export async function getSocialDashboardClient(
  deps: { env?: Env; queryOne?: typeof dbQueryOne; fetchImpl?: typeof fetch } = {},
): Promise<SocialDashboardClient | null> {
  const cfg = await loadSocialDashboardConfig(deps)
  if (!cfg) return null
  return createSocialDashboardClient({ baseUrl: cfg.baseUrl, serviceSecret: cfg.serviceSecret, fetchImpl: deps.fetchImpl })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/feeds/config.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full feeds test folder + typecheck**

Run: `pnpm exec vitest run test/feeds/`
Expected: all suites PASS.

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -i 'server/utils/feeds' || echo 'no feeds type errors'`
Expected: `no feeds type errors` (pre-existing errors elsewhere are fine).

- [ ] **Step 6: Commit**

```bash
git add server/utils/feeds/config.ts test/feeds/config.test.ts
git commit -m "feat(feeds): config + DEALER_FEEDS_ENABLED flag + client factory"
```

---

## Self-review (against the spec)

- **Spec coverage (P1 foundation rows):** `FeedProvider` interface/registry → Tasks 2,4 ✅ · `socialDashboardClient` (REST + service-auth) → Task 3 ✅ · `client_feed_links` with **both** `external_org_id` and `seller_refs` → Tasks 1,5 ✅ · service-auth header contract (`x-feed-service-secret` + asserted org) → Task 3 ✅ · `integration_configs` connection + `DEALER_FEEDS_ENABLED` → Task 6 ✅. SD-side `create_feed`/`search_inventory`/service-auth endpoints are **P1b** (separate plan); P1a consumes them via the documented contract and tests against mocks. Cache tables, AI tools, cron, brief auto-fill, pacing = P3/P2/P4 plans.
- **Placeholder scan:** none — every step has runnable code/commands.
- **Type consistency:** `FeedProviderContext`, `DealerLink`, `FeedRef`, `FeedSummary`, `VehicleSummary` used identically across Tasks 2–6; client `call(ctx, method, path, body?)` signature matches provider usage; `getDealerLink`/`loadSocialDashboardConfig` inject `queryOne` consistently.

## Out of scope for P1a (later plans)

- **P1b — social-dashboard enhancements:** `serviceAuth.ts`, `inventorySearch.ts`, `POST /api/feeds/search-inventory`, service-auth on existing `/api/feeds/*`, MCP `create_feed` + `search_inventory`. (Node `--test` runner.)
- **P2** chatbot AiTools + `FEEDS` permission group · **P3** sync cron + cache tables · **P4** brief auto-fill + pacing.
