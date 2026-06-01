# Social Publishing + Calendar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an organic social publishing module (`/agency/social`) — calendar hub + Compose route — that publishes one creative to 6 networks, scheduled via a companion-Worker cron, with per-network customization, tagging, and internal approvals.

**Architecture:** Port-and-adapt from the sibling app `promotion-knoxgwmhaval` (`server/api/admin/social-marketing/**`, `server/utils/social-providers/**`, `pages/admin/social-marketing/**`). Three systematic adaptations on every ported file: UI kit → Nuxt UI v4; DB (`getNeonSql` tagged templates) → `queryRows/queryOne/execute/transaction` parameterized SQL from `server/utils/db.ts`; tenancy (`dealer_id`/better-auth) → `client_id`/`requireAuth`+`requireRole`. The Composer is architected so paid mode folds in later; `/agency/ad-publish` stays standalone.

**Tech Stack:** Nuxt 4, Vue 3 `<script setup>`, Nuxt UI v4, Neon Postgres via `db.ts`, Cloudflare R2 + companion Worker cron, Groq (AI caption/image), Vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-06-01-social-publishing-design.md`

**Source paths (read-only reference, NOT in this repo):** `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`

---

## Pre-flight (do once before Phase A)

- [ ] **Confirm migration numbers.** Run `ls server/database/migrations | sort -t- -k1 -n | tail -3`. This plan assumes the next free numbers are **144–148**. If the tail shows ≥144 already, shift every migration number in this plan up accordingly and keep them contiguous. Record the chosen base number.
- [ ] **Confirm DB helpers.** `grep -nE 'export (async )?(function|const) (queryRows|queryOne|execute|transaction)' server/utils/db.ts` — all four must resolve. Use `queryRows<T>(sql, params)` for multi-row reads, `queryOne<T>` for single, `execute(sql, params)` for writes (returns affected count), `transaction(cb)` for multi-statement atomicity (inside, use `client.query()` directly — never the helpers, per CLAUDE.md).
- [ ] **Confirm RBAC constants.** `grep -nE 'CREATIVE|MANAGEMENT' server/utils/permissions.ts`. Publishing writes use `requireRole(event, PERMISSIONS.CREATIVE)`; approvals use `PERMISSIONS.MANAGEMENT`.

---

## File Structure

**Server (`server/`):**
- `utils/social-providers/{types,registry,facebook,instagram,linkedin,tiktok,youtube,google-business}.ts` — provider layer (ported, near-verbatim).
- `utils/socialPublishing.ts` — new: `resolvePlatformContent()` (base + `platform_overrides` merge), `stampUtms()`, `publishPost()` (the shared publish loop used by both the manual endpoint and the cron).
- `utils/socialSlots.ts` — new: `nextOptimalSlots()` (ported optimal-times logic).
- `api/agency/social/publishing/accounts/{index.get,connect.get,callback.get,[id].delete}.ts`
- `api/agency/social/publishing/posts/{index.get,index.post,[id]/index.get,[id]/index.patch,[id]/index.delete,[id]/publish.post,[id]/request-approval.post,[id]/approve.post,[id]/reject.post}.ts`
- `api/agency/social/publishing/{slots/index.get,slots/index.post,queue/index.get,queue/reorder.post,approvals/index.get,approvals/badge.get,calendar.get,analytics/overview.get}.ts`
- `api/agency/social/publishing/ai/{generate-caption.post,generate-image.post}.ts`
- `api/cron/publish-social-posts.post.ts` — dispatcher.
- `database/migrations/144..148_social_*.sql`

**Companion Worker:** `workers/social-dispatch-cron/{src/index.ts,wrangler.toml,package.json,tsconfig.json}` (clone of `workers/meta-status-cron`).

**Frontend (`app/`):**
- `pages/agency/social/{index,compose,queue,planner,approvals,analytics,accounts}.vue`
- `composables/useSocialPublishing.ts`, `useSocialComposer.ts`
- `components/social-publishing/{PostComposer,PostComposerMedia,PostComposerAI,PlatformPreviewPane,ContentCalendar,QueueList,ApprovalsList,AccountCard}.vue` (ported + re-skinned)
- Reuse existing: `components/ad-preview/{MetaFeedPreview,MetaStoryPreview,TikTokPreview,LinkedInPreview}.vue`, `components/ad-publish/BulkCreativePicker.vue`.
- `types/index.ts` — append social-publishing types.

**Marketing:** `pages/features/index.vue`, `pages/features/[slug].vue`, `components/MarketingNav.vue`.

---

## Phase A — Data Model

### Task A1: `social_accounts` migration

**Files:**
- Create: `server/database/migrations/144_social_accounts.sql`
- Test: `server/utils/__tests__/socialSchema.test.ts`

- [ ] **Step 1: Write the migration**

```sql
-- 144_social_accounts.sql — client-scoped organic publishing connections
CREATE TABLE IF NOT EXISTS social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,                 -- facebook|instagram|linkedin|tiktok|youtube|google-business
  platform_account_id TEXT NOT NULL,      -- page/profile id on the platform
  account_name TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, platform_account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_client ON social_accounts(client_id, is_active);
```

- [ ] **Step 2: Run it against Neon**

```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/144_social_accounts.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX`, no error (idempotent on re-run).

- [ ] **Step 3: Write a schema assertion test**

```ts
import { describe, it, expect } from 'vitest'
import { queryRows } from '~~/server/utils/db'

describe('social schema', () => {
  it('social_accounts has client_id + token columns', async () => {
    const cols = await queryRows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      ['social_accounts'],
    )
    const names = cols.map(c => c.column_name)
    expect(names).toEqual(expect.arrayContaining(['client_id', 'platform', 'access_token', 'is_active']))
  })
})
```

- [ ] **Step 4: Run** `pnpm vitest run server/utils/__tests__/socialSchema.test.ts` → PASS.
- [ ] **Step 5: Commit** `git add server/database/migrations/144_social_accounts.sql server/utils/__tests__/socialSchema.test.ts && git commit -m "feat(social): social_accounts table"`

### Task A2: `social_posts` migration (with platform_overrides + tags)

**Files:** Create `server/database/migrations/145_social_posts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 145_social_posts.sql
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  created_by TEXT,
  content TEXT NOT NULL DEFAULT '',
  media_urls TEXT[],
  link_url TEXT,
  hashtags TEXT[],
  first_comment TEXT,
  platforms TEXT[] NOT NULL DEFAULT '{}'::text[],
  account_ids UUID[],
  platform_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {instagram:{content,mediaUrls},...}
  tags TEXT[],
  scheduled_at TIMESTAMPTZ,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','approved','scheduled','publishing','published','partially_published','failed','cancelled'
  )),
  platform_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  publish_attempts INT NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  approval_requested_at TIMESTAMPTZ,
  approval_requested_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  queue_position INT,
  queued_from_optimal BOOLEAN DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_posts_client ON social_posts(client_id, status);
CREATE INDEX IF NOT EXISTS idx_social_posts_due ON social_posts(scheduled_at)
  WHERE status IN ('approved','scheduled');
CREATE INDEX IF NOT EXISTS idx_social_posts_queue ON social_posts(client_id, queue_position)
  WHERE queue_position IS NOT NULL AND status IN ('draft','scheduled');
```

- [ ] **Step 2: Run it** (same psql pattern as A1). Expected: no error.
- [ ] **Step 3: Extend the schema test** — add an assertion that `social_posts` columns include `['platform_overrides','tags','platform_results','queue_position']`.
- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(social): social_posts table with platform_overrides + tags"`

### Task A3: slots + support tables migration

**Files:** Create `server/database/migrations/146_social_support.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 146_social_support.sql
CREATE TABLE IF NOT EXISTS social_slot_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Posting slot',
  platforms TEXT[] NOT NULL DEFAULT '{}'::text[],
  day_of_week INT NOT NULL,               -- 0=Sun..6=Sat
  time_of_day TIME NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Australia/Sydney',
  capacity INT NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_slots_client ON social_slot_schedules(client_id, enabled);

CREATE TABLE IF NOT EXISTS social_post_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT,
  platforms TEXT[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_post_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  impressions INT DEFAULT 0,
  engagements INT DEFAULT 0,
  clicks INT DEFAULT 0,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_metrics_post ON social_post_metrics(post_id);
```

- [ ] **Step 2: Run it.** Expected: no error.
- [ ] **Step 3: Commit** `git add server/database/migrations/146_social_support.sql && git commit -m "feat(social): slot schedules + templates + metrics tables"`

---

## Phase B — Provider Layer

### Task B1: Port provider types + registry

**Files:**
- Create: `server/utils/social-providers/types.ts`, `server/utils/social-providers/registry.ts`
- Test: `server/utils/social-providers/__tests__/registry.test.ts`

- [ ] **Step 1: Port `types.ts` verbatim** from source `server/utils/social-providers/types.ts`. It is pure TypeScript (no DB/auth) — copy as-is. It defines `SocialPostProvider`, `PostParams`, `CommentParams`, `PostResult`, `MediaItem`, `PlatformLimits`.

- [ ] **Step 2: Write `registry.ts`**

```ts
import type { SocialPostProvider } from './types'
import { facebookProvider } from './facebook'
import { instagramProvider } from './instagram'
import { linkedinProvider } from './linkedin'
import { tiktokProvider } from './tiktok'
import { youtubeProvider } from './youtube'
import { googleBusinessProvider } from './google-business'

const providers = new Map<string, SocialPostProvider>([
  ['facebook', facebookProvider],
  ['instagram', instagramProvider],
  ['linkedin', linkedinProvider],
  ['tiktok', tiktokProvider],
  ['youtube', youtubeProvider],
  ['google-business', googleBusinessProvider],
])

export function getProvider(platform: string): SocialPostProvider | undefined {
  return providers.get(platform)
}
export function getProviderOrThrow(platform: string): SocialPostProvider {
  const p = providers.get(platform)
  if (!p) throw createError({ statusCode: 400, statusMessage: `Unsupported platform: ${platform}` })
  return p
}
export function supportedPlatforms(): string[] {
  return [...providers.keys()]
}
```

- [ ] **Step 3: Write the test** (use a temporary stub: comment out provider imports not yet ported and register a fake in the test via a local map — OR run this test only after B2). Simplest: write the test asserting `supportedPlatforms()` returns the 6 names, and run it after B2.

```ts
import { describe, it, expect } from 'vitest'
import { supportedPlatforms, getProviderOrThrow } from '../registry'

describe('provider registry', () => {
  it('registers 6 platforms', () => {
    expect(supportedPlatforms().sort()).toEqual(
      ['facebook','google-business','instagram','linkedin','tiktok','youtube'])
  })
  it('throws on unknown platform', () => {
    expect(() => getProviderOrThrow('myspace')).toThrow()
  })
})
```

- [ ] **Step 4: Defer running** until B2 ports the providers (registry imports them). Commit types only now: `git add server/utils/social-providers/types.ts && git commit -m "feat(social): provider interface types"`

### Task B2: Port the 6 providers

**Files:** Create `server/utils/social-providers/{facebook,instagram,linkedin,tiktok,youtube,google-business}.ts`

- [ ] **Step 1: Port each provider file verbatim** from the matching source file under `promotion-knoxgwmhaval/server/utils/social-providers/`. These are pure `$fetch`/Graph-API modules implementing `SocialPostProvider`. The ONLY adaptation: change any `~/server/...` import to `~~/server/...` (Nitro double-tilde). They do not touch the DB or auth, so no DB/tenancy adaptation is needed. Each exports a `const <name>Provider: SocialPostProvider`.

- [ ] **Step 2: Add `registry.ts` from B1** (now its imports resolve).

- [ ] **Step 3: Run** `pnpm vitest run server/utils/social-providers/__tests__/registry.test.ts` → PASS (6 platforms; throws on unknown).

- [ ] **Step 4: Write one provider unit test** with a mocked `$fetch` to lock the contract (Facebook example):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { facebookProvider } from '../facebook'

beforeEach(() => { vi.stubGlobal('$fetch', vi.fn(async () => ({ id: '123_456', post_id: '123_456' }))) })

describe('facebookProvider.post', () => {
  it('returns platformPostId + url on success', async () => {
    const r = await facebookProvider.post({
      accountId: 'PAGE1', accessToken: 'tok', content: 'hi', media: [],
    })
    expect(r.status).toBe('success')
    expect(r.platformPostId).toBeTruthy()
  })
})
```
Adjust the mocked return + assertions to match the actual `facebook.ts` response shape you ported.

- [ ] **Step 5: Commit** `git add server/utils/social-providers && git commit -m "feat(social): port 6 publish providers + registry"`

---

## Phase C — Publish Core (the new shared logic)

### Task C1: `resolvePlatformContent` + `stampUtms`

**Files:** Create `server/utils/socialPublishing.ts`; Test `server/utils/__tests__/socialPublishing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolvePlatformContent, stampUtms } from '~~/server/utils/socialPublishing'

describe('resolvePlatformContent', () => {
  const base = { content: 'Base', mediaUrls: ['a.jpg'] }
  it('inherits base when no override', () => {
    expect(resolvePlatformContent(base, {}, 'instagram')).toEqual(base)
  })
  it('applies per-network override', () => {
    const ov = { instagram: { content: 'IG copy' } }
    expect(resolvePlatformContent(base, ov, 'instagram')).toEqual({ content: 'IG copy', mediaUrls: ['a.jpg'] })
  })
})

describe('stampUtms', () => {
  it('adds utm params for a platform', () => {
    const u = stampUtms('https://x.com/p', 'facebook', 'post123')
    expect(u).toContain('utm_source=facebook')
    expect(u).toContain('utm_medium=social')
  })
  it('returns null for null url', () => {
    expect(stampUtms(null, 'facebook', 'p')).toBeNull()
  })
})
```

- [ ] **Step 2: Run** `pnpm vitest run server/utils/__tests__/socialPublishing.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
export interface BaseContent { content: string; mediaUrls: string[] }
export interface PlatformOverride { content?: string; mediaUrls?: string[] }

export function resolvePlatformContent(
  base: BaseContent,
  overrides: Record<string, PlatformOverride>,
  platform: string,
): BaseContent {
  const ov = overrides?.[platform]
  if (!ov) return { content: base.content, mediaUrls: base.mediaUrls }
  return {
    content: ov.content ?? base.content,
    mediaUrls: ov.mediaUrls ?? base.mediaUrls,
  }
}

export function stampUtms(url: string | null, platform: string, postId: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    u.searchParams.set('utm_source', platform)
    u.searchParams.set('utm_medium', 'social')
    u.searchParams.set('utm_campaign', `post_${postId}`)
    return u.toString()
  } catch {
    return url
  }
}
```

- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(social): platform_overrides resolution + UTM stamping"`

### Task C2: `publishPost()` shared loop

**Files:** Modify `server/utils/socialPublishing.ts`; Test same file's test.

- [ ] **Step 1: Write the failing test** (mock registry + db)

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('~~/server/utils/social-providers/registry', () => ({
  getProviderOrThrow: () => ({ post: vi.fn(async () => ({ platformPostId: 'p1', url: 'u', status: 'success' })) }),
}))
vi.mock('~~/server/utils/db', () => ({ execute: vi.fn(async () => 1) }))

import { publishPost } from '~~/server/utils/socialPublishing'

describe('publishPost', () => {
  it('publishes each platform and returns aggregated status', async () => {
    const post = {
      id: 'X', content: 'hi', media_urls: ['a.jpg'], link_url: null,
      platforms: ['facebook','instagram'], platform_overrides: {},
      accounts: [
        { id: 'a1', platform: 'facebook', platform_account_id: 'PG', access_token: 't', account_name: 'FB' },
        { id: 'a2', platform: 'instagram', platform_account_id: 'IG', access_token: 't', account_name: 'IG' },
      ],
    }
    const res = await publishPost(post as any)
    expect(res.status).toBe('published')
    expect(Object.keys(res.platformResults)).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run** → FAIL (`publishPost` not exported).

- [ ] **Step 3: Implement** (adapted from source `posts/[id]/publish.post.ts` publish loop; tenancy/DB swapped):

```ts
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'

export interface PublishablePost {
  id: string; content: string; media_urls: string[] | null; link_url: string | null
  platforms: string[]; platform_overrides: Record<string, PlatformOverride>
  accounts: Array<{ id: string; platform: string; platform_account_id: string; access_token: string; account_name: string | null }>
}
export interface PublishOutcome { status: 'published' | 'partially_published' | 'failed'; platformResults: Record<string, any> }

export async function publishPost(post: PublishablePost): Promise<PublishOutcome> {
  const base: BaseContent = { content: post.content, mediaUrls: post.media_urls ?? [] }
  const results: Record<string, any> = {}
  let ok = 0, fail = 0

  for (const platform of post.platforms) {
    const account = post.accounts.find(a => a.platform === platform)
    if (!account) { results[platform] = { status: 'failed', error: 'No connected account' }; fail++; continue }
    const resolved = resolvePlatformContent(base, post.platform_overrides ?? {}, platform)
    const link = stampUtms(post.link_url, platform, post.id)
    const content = link ? `${resolved.content}\n${link}` : resolved.content
    try {
      const provider = getProviderOrThrow(platform)
      const r = await provider.post({
        accountId: account.platform_account_id,
        accessToken: account.access_token,
        content,
        media: resolved.mediaUrls.map(url => ({ url, type: 'image' as const })),
      })
      results[platform] = { status: r.status, platformPostId: r.platformPostId, url: r.url, error: r.error ?? null }
      r.status === 'success' ? ok++ : fail++
    } catch (e: any) {
      results[platform] = { status: 'failed', error: e?.message ?? 'publish failed' }
      fail++
    }
  }
  const status = fail === 0 ? 'published' : ok === 0 ? 'failed' : 'partially_published'
  return { status, platformResults: results }
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -am "feat(social): publishPost shared multi-network loop"`

---

## Phase D — Accounts & OAuth

### Task D1: Accounts list + delete endpoints

**Files:** Create `server/api/agency/social/publishing/accounts/index.get.ts`, `[id].delete.ts`; Test `server/api/agency/social/publishing/__tests__/accounts.test.ts`

- [ ] **Step 1: Write `index.get.ts`**

```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return await queryRows(
    `SELECT id, client_id, platform, platform_account_id, account_name, is_active, last_error, token_expires_at
     FROM social_accounts WHERE client_id = $1 ORDER BY platform`,
    [clientId],
  )
})
```

- [ ] **Step 2: Write `[id].delete.ts`** — `requireRole(event, PERMISSIONS.CREATIVE)`, then `execute('DELETE FROM social_accounts WHERE id = $1', [id])`, return `{ ok: true }`.

- [ ] **Step 3: Write an integration test** that inserts a `social_accounts` row for a test client, calls the handler via `$fetch` against the test server (mirror an existing `server/api/**/__tests__` test in the repo for the harness), asserts the row is returned then deleted.

- [ ] **Step 4: Run** the test → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(social): accounts list + delete endpoints"`

### Task D2: OAuth connect + callback (port per network)

**Files:** Create `server/api/agency/social/publishing/accounts/connect.get.ts`, `callback.get.ts`

- [ ] **Step 1: Port the connect/callback flow** from source `server/api/admin/social-marketing/connect/{linkedin,youtube}.get.ts` + `connect/*/callback.post.ts`, plus the FB/IG Graph connect already proven in the dashboard's `server/api/agency/social/google/*` flow. Adaptations: store the resulting page/profile token into `social_accounts` (client-scoped via the `clientId` query param / state), using `execute(...)` INSERT with `ON CONFLICT (platform, platform_account_id) DO UPDATE`. Keep this table **separate** from `social_connections` (spend) per spec §6.

- [ ] **Step 2: Manual smoke** — `pnpm dev`, visit `/agency/social/accounts`, connect a sandbox FB page, confirm a `social_accounts` row appears with a non-null `access_token`.

- [ ] **Step 3: Commit** `git commit -m "feat(social): OAuth connect/callback storing publishing tokens"`

> **Plan-time note (spec §10):** decide token-refresh cadence per network; some need proactive refresh before `token_expires_at`. Add a refresh helper in `socialPublishing.ts` if a network's tokens are short-lived.

---

## Phase E — Posts API, Scheduling & Dispatcher

### Task E1: Posts create/list/get/patch/delete

**Files:** Create the 5 `posts/**` CRUD endpoints; Test `posts.test.ts`

- [ ] **Step 1: Write `posts/index.post.ts`** (create draft)

```ts
import { requireRole, PERMISSIONS } from '~~/server/utils/auth'   // confirm export path of PERMISSIONS
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, PERMISSIONS.CREATIVE)
  const b = await readBody(event)
  if (!b.clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const row = await queryOne(
    `INSERT INTO social_posts (client_id, created_by, content, media_urls, link_url, hashtags,
       first_comment, platforms, account_ids, platform_overrides, tags, scheduled_at, timezone, status, metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [b.clientId, user.id, b.content ?? '', b.mediaUrls ?? null, b.linkUrl ?? null, b.hashtags ?? null,
     b.firstComment ?? null, b.platforms ?? [], b.accountIds ?? null, JSON.stringify(b.platformOverrides ?? {}),
     b.tags ?? null, b.scheduledAt ?? null, b.timezone ?? 'Australia/Sydney', b.status ?? 'draft',
     JSON.stringify(b.metadata ?? {})],
  )
  return row
})
```

- [ ] **Step 2: Write `index.get.ts`** (list by client/status/limit, mirror sibling `posts/index.get.ts`), `[id]/index.get.ts`, `[id]/index.patch.ts` (partial update incl. `platform_overrides`/`tags`/`scheduled_at`), `[id]/index.delete.ts`.

- [ ] **Step 3: Integration test** — create a post, list it, patch its content + an instagram override, GET and assert `platform_overrides.instagram.content`, then delete. Run → PASS.

- [ ] **Step 4: Commit** `git commit -m "feat(social): posts CRUD with overrides + tags"`

### Task E2: Manual publish endpoint

**Files:** Create `posts/[id]/publish.post.ts`

- [ ] **Step 1: Write the endpoint** — `requireRole(CREATIVE)`; load post + its `social_accounts` (by `account_ids`); guard status (`published`/`publishing`/`cancelled` → 400; require `approved` or `approved_at`); set `status='publishing'`; call `publishPost({...post, accounts})`; persist `platform_results`, final `status`, `published_at`, `publish_attempts+1`, `last_attempt_at`. Return the outcome.

- [ ] **Step 2: Integration test** — seed an `approved` post + a stubbed account; mock the provider registry (as in C2); call publish; assert DB row goes `published` with `platform_results` populated. Run → PASS.

- [ ] **Step 3: Commit** `git commit -m "feat(social): manual publish endpoint"`

### Task E3: Dispatcher cron endpoint (idempotent claim)

**Files:** Create `server/api/cron/publish-social-posts.post.ts`; Test `cron-publish.test.ts`

- [ ] **Step 1: Write the failing test** for the claim being idempotent

```ts
// Seed one 'scheduled' post due now. Call the handler twice "concurrently".
// Assert publishPost (mocked) is invoked at most once for that post.
```

- [ ] **Step 2: Implement**

```ts
import { defineEventHandler, getHeader, createError } from 'h3'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { publishPost } from '~~/server/utils/socialPublishing'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!import.meta.dev && secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const due = await queryRows<any>(
    `SELECT id FROM social_posts
     WHERE scheduled_at <= NOW() AND status IN ('scheduled','approved') AND publish_attempts < 3
     ORDER BY scheduled_at ASC LIMIT 10`)
  const results: any[] = []
  for (const { id } of due) {
    // Idempotent claim: only one tick wins this row.
    const claimed = await execute(
      `UPDATE social_posts SET status='publishing', last_attempt_at=NOW(), updated_at=NOW()
       WHERE id=$1 AND status IN ('scheduled','approved')`, [id])
    if (claimed === 0) continue
    const post = await queryOne<any>(`SELECT * FROM social_posts WHERE id=$1`, [id])
    const accounts = await queryRows<any>(
      `SELECT id, platform, platform_account_id, access_token, account_name
       FROM social_accounts WHERE id = ANY($1) AND is_active = TRUE`, [post.account_ids ?? []])
    const outcome = await publishPost({ ...post, accounts })
    await execute(
      `UPDATE social_posts SET status=$2, platform_results=$3::jsonb,
         publish_attempts=publish_attempts+1, published_at=COALESCE(published_at, NOW()), updated_at=NOW()
       WHERE id=$1`,
      [id, outcome.status, JSON.stringify(outcome.platformResults)])
    results.push({ id, status: outcome.status })
  }
  return { processed: results.length, results }
})
```

- [ ] **Step 3: Run** the test → PASS (second concurrent claim is a no-op).
- [ ] **Step 4: Commit** `git commit -m "feat(social): scheduled publish dispatcher with idempotent claim"`

### Task E4: Companion Worker

**Files:** Create `workers/social-dispatch-cron/{src/index.ts,wrangler.toml,package.json,tsconfig.json}` (clone `workers/meta-status-cron`)

- [ ] **Step 1: Write `src/index.ts`**

```ts
interface Env { APP_BASE_URL: string; CRON_SECRET: string }
export default {
  async scheduled(_c: ScheduledController, env: Env) {
    const resp = await fetch(`${env.APP_BASE_URL}/api/cron/publish-social-posts`, {
      method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET },
    })
    console.log('social-dispatch-cron.run', { status: resp.status, body: (await resp.text()).slice(0, 200) })
  },
}
```

- [ ] **Step 2: Write `wrangler.toml`** (clone meta-status-cron; `name="social-dispatch-cron"`, `crons = ["*/2 * * * *"]`, `APP_BASE_URL` var, `CRON_SECRET` as a secret).
- [ ] **Step 3: Copy** `package.json` + `tsconfig.json` from `workers/meta-status-cron`, rename.
- [ ] **Step 4: Commit** `git commit -m "feat(social): social-dispatch-cron companion worker"` (Deploy + `wrangler secret put CRON_SECRET` happens at release, documented in the runbook section.)

---

## Phase F — Scheduling helpers, Queue & Approvals

### Task F1: Slots + optimal-times helper

**Files:** Create `server/utils/socialSlots.ts` (port `social-slot-schedule.ts` + `optimal-times/next-slots.get.ts` logic, DB-adapted); `slots/index.{get,post}.ts`; Test `socialSlots.test.ts`.

- [ ] **Step 1: Write failing test** for `nextOptimalSlots(clientId, count)` returning N future Date/timezone slots derived from `social_slot_schedules`.
- [ ] **Step 2: Implement** `nextOptimalSlots` (port the slot-walk logic; replace tagged SQL with `queryRows`). Use `@internationalized/date` for tz-correct slot times.
- [ ] **Step 3: Write `slots/index.get.ts`/`index.post.ts`** CRUD (`requireRole(CREATIVE)`).
- [ ] **Step 4: Run** test → PASS. **Commit** `git commit -m "feat(social): posting slots + optimal-time queueing"`.

### Task F2: Queue endpoints

**Files:** Create `queue/index.get.ts` (posts with non-null `queue_position` ordered), `queue/reorder.post.ts` (accept ordered id list → set `queue_position`). Port from sibling `queue/*`.

- [ ] **Step 1–4:** Write endpoints; integration test that reorder persists positions; run → PASS; **commit** `git commit -m "feat(social): publishing queue endpoints"`.

### Task F3: Approvals endpoints + notifications

**Files:** Create `posts/[id]/request-approval.post.ts`, `approve.post.ts`, `reject.post.ts`, `approvals/index.get.ts`, `approvals/badge.get.ts`.

- [ ] **Step 1: Write `request-approval.post.ts`** — `requireRole(CREATIVE)`; set `approval_requested_at=NOW()`, `approval_requested_by=user.id`; fire a notification via the existing `~~/server/utils/notifications.ts` to MANAGEMENT-permission users.
- [ ] **Step 2: Write `approve.post.ts`** — `requireRole(MANAGEMENT)`; set `approved_by/at`, `status='approved'`; notify requester. `reject.post.ts` — set `rejection_reason`, `status='draft'`; notify requester.
- [ ] **Step 3: Write `approvals/index.get.ts`** (posts where `approval_requested_at IS NOT NULL AND approved_at IS NULL`) + `badge.get.ts` (count).
- [ ] **Step 4: Integration test** — request→approve transitions; assert status + notification call (mock notifications). Run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(social): internal approval workflow + notifications"`

---

## Phase G — Frontend: Composer

### Task G1: Types + composables

**Files:** Modify `app/types/index.ts` (append `SocialPost`, `SocialAccount`, `SocialSlot`, `PlatformOverride` interfaces matching the API shapes from Phase E). Create `app/composables/useSocialPublishing.ts` (fetch posts/accounts/calendar via `useFetch`/`$fetch`) and `useSocialComposer.ts` (composer state: base content, per-platform overrides map, selected platforms/accounts, media, schedule mode).

- [ ] **Step 1:** Add types. **Step 2:** Write composables (module-scope refs or `useState` to avoid the per-caller-ref pitfall noted in project memory). **Step 3:** Typecheck `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` for the new files. **Step 4:** Commit `git commit -m "feat(social): publishing types + composables"`.

### Task G2: PostComposer (port + re-skin)

**Files:** Create `app/components/social-publishing/{PostComposer,PostComposerMedia,PostComposerAI}.vue` and `app/pages/agency/social/compose.vue`.

- [ ] **Step 1: Port `PostComposer.vue`** from source `components/admin/social-marketing/PostComposer.vue`, applying: shadcn `Button`/`Input`/`Textarea`/`Tabs`/`Dialog` → `UButton`/`UInput`/`UTextarea`/`UTabs`/`UModal`; wrap every field in `UFormField` (per CLAUDE.md); dark-mode semantic colors. Wire to `useSocialComposer`. **Invoke the `frontend-design` skill first** (mandatory for any form work per CLAUDE.md).
- [ ] **Step 2: Per-network customization** — a "Customize per network" `UCheckbox` reveals a `UTabs` tab per selected platform binding to the overrides map (writes `platform_overrides`). Add first-comment + tags `UInput`s.
- [ ] **Step 3: Creatives** — embed the existing `AdPublishBulkCreativePicker` (Banner Studio) + port `PostComposerMedia.vue` (R2 media library, `media/browse`) + `PostComposerAI.vue` (AI caption/image via the new `ai/*` endpoints — port `ai/generate-caption.post.ts`/`generate-image.post.ts`, rewire to the dashboard's Groq client).
- [ ] **Step 4: compose.vue** — read `?edit`/`?client`/`?creative` query during setup (not onMounted), prefill composer, schedule controls (now / schedule / queue), Save Draft / Request Approval / Schedule buttons calling Phase E/F endpoints.
- [ ] **Step 5: Component test** — mount `PostComposer` with happy-dom, toggle customize-per-network, assert an override tab renders and editing it updates the composer state. Run `pnpm vitest run` → PASS.
- [ ] **Step 6: Commit** `git commit -m "feat(social): post composer with per-network customization + creatives"`

### Task G3: Per-network preview pane

**Files:** Create `app/components/social-publishing/PlatformPreviewPane.vue`

- [ ] **Step 1:** Build a pane that, per selected platform, renders the resolved content (base + override) into the existing `MetaFeedPreview`/`MetaStoryPreview`/`TikTokPreview`/`LinkedInPreview`. For IG-Reel/carousel, YouTube, Google Business (no existing dashboard preview), port the relevant `previews/*` from source `components/admin/social-marketing/previews/`.
- [ ] **Step 2:** Component test — feed a base + instagram override, assert the IG preview shows the override text. Run → PASS.
- [ ] **Step 3: Commit** `git commit -m "feat(social): live per-network preview pane"`

---

## Phase H — Frontend: Calendar, Queue, Planner, Approvals, Analytics, Accounts

### Task H1: Calendar hub

**Files:** Create `app/components/social-publishing/ContentCalendar.vue` + `app/pages/agency/social/index.vue`.

- [ ] **Step 1: Port `ContentCalendar.vue`** from source `components/admin/ContentCalendar.vue` (1089 lines) re-skinned to Nuxt UI v4 + `UCalendar`/`@internationalized/date` (reuse the `toCalendarDate()` helper pattern from `app/components/workflow/TaskCreateDialog.vue` per CLAUDE.md). Colour-code organic posts by status; reserve a colour token for future paid. Click a day → navigate to `/agency/social/compose?date=...`; click a post → open detail/edit.
- [ ] **Step 2: index.vue** — `definePageMeta({ layout: 'agency', middleware: ['role-creative'] })`; client picker (reuse the agency client selector pattern); fetch `calendar.get` for the visible month; render `ContentCalendar`.
- [ ] **Step 3: Write `calendar.get.ts`** — returns posts in a date range for a client (id, scheduled_at, status, platforms, first media thumbnail).
- [ ] **Step 4: Component smoke test** — mount with a couple of seeded posts, assert they render on the right days. Run → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat(social): calendar hub view"`

### Task H2: Queue, Planner, Approvals, Accounts, Analytics pages

**Files:** Create `app/pages/agency/social/{queue,planner,approvals,accounts,analytics}.vue` + matching ported components.

- [ ] **Step 1: queue.vue** — port `queue.vue`; drag-reorder (the dashboard already uses draggable elsewhere) → calls `queue/reorder`. 
- [ ] **Step 2: approvals.vue** — port `approvals.vue`; list pending, approve/reject with `UModal` (reason). Add a nav badge from `approvals/badge.get`.
- [ ] **Step 3: accounts.vue** — port `accounts.vue`; list `social_accounts` per client, connect buttons (Phase D), show `last_error`/expiry with a "reconnect" prompt.
- [ ] **Step 4: analytics.vue** — port `analytics.vue` overview; write `analytics/overview.get.ts` reading `social_post_metrics` (+ published counts). (Deep reporting is slice #3 — keep this to top-line cards.)
- [ ] **Step 5: planner.vue** — port `planner.vue` (AI week planner via ported `plans/*` if Groq-wired; otherwise ship a stub that lists slots + suggested times and defer AI generation — note the cut in-page).
- [ ] **Step 6: Per-page smoke tests** (mount, assert primary list renders). Run → PASS.
- [ ] **Step 7: Commit** per page, e.g. `git commit -m "feat(social): queue view"`, etc.

---

## Phase I — Navigation & Marketing Sync

### Task I1: Nav entry + middleware

**Files:** Modify the agency sidebar nav config (locate via `grep -rl "Ad Spend" app/`), add a "Social" group linking the 7 views. Confirm `middleware: ['role-creative']` exists (it's used by ad-publish); reuse it on all `/agency/social/*` pages.

- [ ] **Step 1:** Add nav items. **Step 2:** Manual check — links resolve, viewers are blocked. **Step 3:** Commit `git commit -m "feat(social): sidebar navigation"`.

### Task I2: Marketing-page sync (per CLAUDE.md)

**Files:** Modify `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue`.

- [ ] **Step 1:** Add a "Social Publishing" feature entry (category + a `[slug]` detail with 3–4 sections: calendar, composer + per-network, scheduling/queue, approvals). Add to the MarketingNav mega-menu.
- [ ] **Step 2:** Manual check — `/features` lists it; the slug page renders.
- [ ] **Step 3:** Commit `git commit -m "docs(social): marketing pages for social publishing"`.

---

## Phase J — Verification & Release

### Task J1: Full test + typecheck

- [ ] **Step 1:** `pnpm vitest run` — all new social tests green.
- [ ] **Step 2:** `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck` — no NEW errors (≈60 pre-existing from `index.d.ts` are expected per CLAUDE.md).
- [ ] **Step 3:** Pre-commit deep-dive review per CLAUDE.md: `~/` vs `~~/` server imports, no empty-string `USelectMenu` values, no `@apply` of semantic utilities in `<style scoped>`, SSRF check on the OAuth callback fetches.
- [ ] **Step 4:** Commit any fixes.

### Task J2: Release runbook (document, do not auto-run)

- [ ] **Step 1:** Write `docs/superpowers/handoffs/2026-06-01-social-publishing-release.md` capturing: deploy via `pnpm deploy:production` (from a full `pnpm install` checkout, not a symlinked-nm worktree — per project memory); `cd workers/social-dispatch-cron && wrangler deploy && wrangler secret put CRON_SECRET` (must match the Pages `CRON_SECRET`); set OAuth app credentials per network as Pages env vars; verify `/api/cron/publish-social-posts` returns 200 with the secret and 401 without.
- [ ] **Step 2:** Commit the runbook.

---

## Self-Review (completed against the spec)

- **§4 IA / 7 views** → Phases G/H (Task H1 calendar hub, G2 compose, H2 queue/planner/approvals/accounts/analytics). ✅
- **§5 data model** incl. `platform_overrides` + `tags` → A1–A3 + C1. ✅
- **§6 providers + token reconciliation** → B1/B2 + D1/D2 (separate `social_accounts`). ✅
- **§7 scheduling + dispatcher + companion worker + idempotent claim** → E3/E4 + F1. ✅
- **§8 composer + 3 creative sources + previews** → G2/G3. ✅
- **§9 approvals + observability + testing + marketing sync** → F3 + J1 + I2. ✅
- **Placeholder scan:** UI-port tasks reference exact source files + the 3 adaptations + a smoke test (port instructions, not vague TODOs); core logic has full code. The one explicit deferral (planner AI) is flagged in-task as a documented cut.
- **Type consistency:** `resolvePlatformContent`/`stampUtms`/`publishPost`/`PublishablePost`/`PublishOutcome` names are consistent across C1, C2, E2, E3.
