# Tracking Tag — Slice 1 (Tag + Ingestion Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a portable, framework-agnostic JS tracking tag + a public ingestion endpoint that reliably lands behavioural events (pageview, scroll, engagement, click-to-call, form-submit) + ad attribution into the dashboard's Neon store, from three external dealer sites, with per-client provisioning.

**Architecture:** A vanilla-JS tag (ported & trimmed from the proven "Engagr" `tracking.js`) runs on external dealer sites and POSTs batched events cross-origin to `POST /api/public/track`. The endpoint resolves the client by a **write key** (not request host, because we don't host the dealer sites), validates Origin against a per-client allowlist, snapshots consent, validates with Zod, and inserts into `tracking_events`. An agency admin UI provisions `tracking_sites` rows and renders the install snippet. Conversion fan-out, raw-PII/leads wiring, and 360/personas are deferred to Slices 2–5.

**Tech Stack:** Nuxt 4 / Nitro server routes, Neon Postgres (`server/utils/db.ts`), Zod, Cloudflare Pages (tag hosting + `JOBS_QUEUE` scale path), Nuxt UI v4 (provisioning UI), Vitest (node env) for unit tests. Reference port source: `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval`.

**Spec:** `docs/superpowers/specs/2026-05-31-tracking-tag-slice-1-foundation.md` (read it first).

**Working location:** isolated worktree `.worktrees/tracking-tag-slice-1` on branch `feat/tracking-tag-slice-1`. Run all commands from that worktree root. A concurrent session is active on `main` — do **not** switch this worktree's branch.

---

## Conventions (apply to every task)

- **Server imports:** `~~/server/utils/...` (double-tilde). Never `~/server/utils`.
- **DB:** `import { query, queryOne, execute } from '~~/server/utils/db'`. Inside `transaction(cb)`, use the passed client directly.
- **Auth:** `import { requireAuth, requireRole } from '~~/server/utils/auth'`; `await requireRole(event, ['owner','admin', ...])` takes a literal role array.
- **Tests:** files in `test/**/*.test.ts`, `environment: 'node'`. Import units by **relative path** (e.g. `../../../server/utils/tracking/consent`) — matches `test/server/utils/ga4Funnel.test.ts`. Run one file: `pnpm exec vitest run <path>`.
- **Migrations:** numbered kebab-case in `server/database/migrations/`. Next free number is **125**. Every `CREATE` uses `IF NOT EXISTS`. Run immediately:
  ```bash
  export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
  psql "$DATABASE_URL" -f server/database/migrations/<file>.sql
  ```
- **Commits:** one per task (or per green test cycle), conventional-commit message, end with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Pre-commit:** re-read modified files; check `~/` vs `~~/`; never-throws on the public endpoint; balanced template tags; no empty `USelectMenu` values.

## File structure map

**Create:**
- `server/database/migrations/125-tracking-foundation.sql` — `tracking_sites` + `tracking_events`.
- `server/utils/tracking/track-schema.ts` — Zod behaviour-event schema + `parseTrackPayload`.
- `server/utils/tracking/consent.ts` — `snapshotConsent` (ported, AU opt-out default).
- `server/utils/tracking/normalize.ts` — PII normalisation (ported; forward-compat for Slices 2/3).
- `server/utils/tracking/pii-hash.ts` — SHA-256 PII hashing (ported; forward-compat).
- `server/utils/tracking/site-config.ts` — write-key → `tracking_sites` resolver (cached).
- `server/api/public/track.post.ts` — the public collect endpoint.
- `server/api/public/track.options.ts` — CORS preflight.
- `public/track.js` — the deployable tag (ported & trimmed from reference).
- `server/api/agency/tracking/index.get.ts` / `index.post.ts` — list / create site.
- `server/api/agency/tracking/[id].patch.ts` — update config.
- `server/api/agency/tracking/[id]/rotate-key.post.ts` — rotate write key.
- `server/api/agency/tracking/[id]/snippet.get.ts` — render install snippet.
- `app/pages/agency/tracking/index.vue` — provisioning page.
- `app/components/tracking/SiteCreateSlideover.vue` — create/edit form.
- `app/components/tracking/InstallSnippet.vue` — snippet display + copy.
- Tests under `test/server/utils/tracking/` and `test/server/api/`.

**Modify:** none expected in Slice 1 (all additive). The agency nav may need a link to `/agency/tracking` (Task 9).

---

## Task 1: Database migration (tracking_sites + tracking_events)

**Files:**
- Create: `server/database/migrations/125-tracking-foundation.sql`

- [ ] **Step 1: Confirm the FK type of `agency_clients.id`** (so `client_id` matches)

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -c "\d agency_clients" | grep -E '^ id '
```
Expected: a line showing `id | uuid` (the migration below assumes `uuid`). If it is `integer`/`bigint`, change `client_id UUID` → the matching type in both tables before running.

- [ ] **Step 2: Write the migration**

```sql
-- 125: First-party tracking foundation (Slice 1)
-- tracking_sites: per-client tag config (write key, allowed origins, behaviour flags)
-- tracking_events: raw behavioural events. NO raw PII in Slice 1 (added in Slice 3).

CREATE TABLE IF NOT EXISTS tracking_sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  write_key       TEXT NOT NULL UNIQUE,
  allowed_origins TEXT[] NOT NULL DEFAULT '{}',
  spa             BOOLEAN NOT NULL DEFAULT FALSE,
  consent_mode    TEXT NOT NULL DEFAULT 'off',   -- off | au_optout | consent_gated
  lead_selectors  TEXT[] NOT NULL DEFAULT '{}',
  retention_days  INTEGER NOT NULL DEFAULT 395,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracking_sites_client ON tracking_sites(client_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sites_write_key ON tracking_sites(write_key);

CREATE TABLE IF NOT EXISTS tracking_events (
  id           BIGSERIAL PRIMARY KEY,
  site_id      UUID NOT NULL REFERENCES tracking_sites(id) ON DELETE CASCADE,
  client_id    UUID NOT NULL,
  event_id     TEXT NOT NULL,
  anon_id      TEXT NOT NULL,
  session_id   TEXT,
  event_name   TEXT NOT NULL,
  page_url     TEXT,
  referrer     TEXT,
  utm_source TEXT, utm_medium TEXT, utm_campaign TEXT, utm_term TEXT, utm_content TEXT,
  gclid TEXT, gbraid TEXT, wbraid TEXT, fbclid TEXT, fbc TEXT, fbp TEXT,
  ttclid TEXT, msclkid TEXT, li_fat_id TEXT,
  event_data   JSONB NOT NULL DEFAULT '{}',
  consent      JSONB,
  ua           TEXT,
  ip_hash      TEXT,
  origin       TEXT,
  occurred_at  TIMESTAMPTZ,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracking_events_dedup ON tracking_events(site_id, event_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_client_time ON tracking_events(client_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_events_session ON tracking_events(session_id);
```

- [ ] **Step 3: Run the migration**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/125-tracking-foundation.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` lines, no errors.

- [ ] **Step 4: Verify tables exist**

Run:
```bash
psql "$DATABASE_URL" -c "\dt tracking_sites" -c "\dt tracking_events"
```
Expected: both tables listed.

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/125-tracking-foundation.sql
git commit -m "feat(tracking): migration 125 — tracking_sites + tracking_events"
```

---

## Task 2: Behaviour-event Zod schema (`track-schema.ts`)

Slice 1 ingests *behaviour* (not conversions), so this is a fresh schema modelled on the reference's `CollectEventBody`, with a mandatory browser-canonical `event_id` (Pitfall 4) and the full attribution union.

**Files:**
- Create: `server/utils/tracking/track-schema.ts`
- Test: `test/server/utils/tracking/track-schema.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// test/server/utils/tracking/track-schema.test.ts
import { describe, it, expect } from 'vitest'
import { parseTrackPayload, TRACK_EVENT_NAMES } from '../../../../server/utils/tracking/track-schema'

const valid = {
  events: [{
    event_id: 'evt_abc123',
    event_name: 'page_view',
    anon_id: 'anon_1',
    session_id: 'sess_1',
    page_url: 'https://www.kia.gws.com.au/',
    referrer: 'https://www.google.com/',
    occurred_at: 1748600000000,
    attribution: { gclid: 'G123', utm_source: 'google' },
    event_data: { depth: 50 },
  }],
}

describe('parseTrackPayload', () => {
  it('accepts a well-formed batch', () => {
    const r = parseTrackPayload(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.payload.events).toHaveLength(1)
      expect(r.payload.events[0].event_name).toBe('page_view')
    }
  })

  it('rejects an event with empty event_id (Pitfall 4)', () => {
    const bad = { events: [{ ...valid.events[0], event_id: '' }] }
    const r = parseTrackPayload(bad)
    expect(r.ok).toBe(false)
  })

  it('rejects an unknown event_name', () => {
    const bad = { events: [{ ...valid.events[0], event_name: 'launch_rocket' }] }
    const r = parseTrackPayload(bad)
    expect(r.ok).toBe(false)
  })

  it('rejects a non-object / null body without throwing', () => {
    expect(parseTrackPayload(null).ok).toBe(false)
    expect(parseTrackPayload('nope').ok).toBe(false)
  })

  it('caps batch size at 50 events', () => {
    const many = { events: Array.from({ length: 51 }, () => valid.events[0]) }
    expect(parseTrackPayload(many).ok).toBe(false)
  })

  it('exposes the reserved event-name set for forward-compat (Slice 4 signals)', () => {
    expect(TRACK_EVENT_NAMES).toContain('vehicle_view')
    expect(TRACK_EVENT_NAMES).toContain('form_submit')
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm exec vitest run test/server/utils/tracking/track-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema**

```ts
// server/utils/tracking/track-schema.ts
/**
 * Behaviour-event ingestion schema for POST /api/public/track (Slice 1).
 *
 * Distinct from the (Slice 2) conversion schema: this accepts the looser set of
 * behavioural events the tag emits. event_id is mandatory and non-empty — the
 * browser is the canonical id source for cross-platform dedup (Pitfall 4).
 *
 * The event-name list is a deliberate SUPERSET that reserves the richer signals
 * (vehicle_view, finance_calculator_interact, trade_in_*, test_drive_booking,
 * generate_lead) the Slice 4 persona/360 engine will aggregate — even though
 * some only start firing once Slice 3 wires forms. Reserving them now keeps the
 * tag and store forward-compatible without a schema change later.
 *
 * Pure module. Single dependency: zod. NEVER throws — parseTrackPayload returns
 * a discriminated-union result.
 */
import { z } from 'zod'

export const TRACK_EVENT_NAMES = [
  // core behaviour (fire in Slice 1)
  'page_view', 'scroll', 'engagement', 'click', 'phone_click', 'outbound_click',
  'form_start', 'form_submit', 'form_abandonment',
  // reserved richer signals (Slice 3/4 — accepted now, may not fire yet)
  'vehicle_view', 'vehicle_list_view', 'search', 'filter_change',
  'finance_calculator_interact', 'trade_in_start', 'trade_in_complete',
  'test_drive_booking', 'add_to_wishlist', 'video_play', 'video_progress',
  'return_to_vehicle', 'competitive_referrer', 'generate_lead',
] as const

export const TrackEventNameSchema = z.enum(TRACK_EVENT_NAMES)

const AttributionSchema = z.object({
  utm_source: z.string().max(512).nullable().optional(),
  utm_medium: z.string().max(512).nullable().optional(),
  utm_campaign: z.string().max(512).nullable().optional(),
  utm_content: z.string().max(512).nullable().optional(),
  utm_term: z.string().max(512).nullable().optional(),
  gclid: z.string().max(512).nullable().optional(),
  gbraid: z.string().max(512).nullable().optional(),
  wbraid: z.string().max(512).nullable().optional(),
  fbclid: z.string().max(512).nullable().optional(),
  fbc: z.string().max(512).nullable().optional(),
  fbp: z.string().max(512).nullable().optional(),
  ttclid: z.string().max(512).nullable().optional(),
  msclkid: z.string().max(512).nullable().optional(),
  li_fat_id: z.string().max(512).nullable().optional(),
})

const TrackEventSchema = z.object({
  event_id: z.string().min(1, 'event_id is mandatory (browser-canonical dedup key)').max(128),
  event_name: TrackEventNameSchema,
  anon_id: z.string().min(1).max(128),
  session_id: z.string().max(128).nullable().optional(),
  page_url: z.string().max(2048).nullable().optional(),
  referrer: z.string().max(2048).nullable().optional(),
  occurred_at: z.number().int().positive().optional(), // ms since epoch (browser clock)
  attribution: AttributionSchema.optional(),
  event_data: z.record(z.unknown()).optional(),
})

export const TrackPayloadSchema = z.object({
  events: z.array(TrackEventSchema).min(1).max(50),
})

export type TrackEvent = z.infer<typeof TrackEventSchema>
export type TrackPayload = z.infer<typeof TrackPayloadSchema>

export type TrackParseResult =
  | { ok: true; payload: TrackPayload }
  | { ok: false; errors: { path: string; message: string }[] }

export function parseTrackPayload(input: unknown): TrackParseResult {
  try {
    const result = TrackPayloadSchema.safeParse(input)
    if (result.success) return { ok: true, payload: result.data }
    return {
      ok: false,
      errors: result.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    }
  } catch {
    return { ok: false, errors: [{ path: '', message: 'Invalid body' }] }
  }
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/track-schema.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/track-schema.ts test/server/utils/tracking/track-schema.test.ts
git commit -m "feat(tracking): behaviour-event Zod schema with mandatory event_id"
```

---

## Task 3: Consent module (`consent.ts`, ported)

The reference `consent.ts` is self-contained (zero imports) — port it verbatim, then trim comments referencing other phases. AU sites default to opt-out essential; the EU set is retained but only matters if `consent_mode` is later flipped.

**Files:**
- Create: `server/utils/tracking/consent.ts`
- Test: `test/server/utils/tracking/consent.test.ts`

- [ ] **Step 1: Copy the reference module**

Run:
```bash
cp /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/server/utils/tracking/consent.ts \
   server/utils/tracking/consent.ts
```

- [ ] **Step 2: Trim phase-specific doc comments** (no code changes)

Edit the top doc-block: remove the "Phase 66 TRACK-09 / Phase 67" references and the `collect.post.ts:87` line references. Keep the four-branch behaviour description and `EU_COUNTRY_CODES`. The exported API (`ConsentSnapshot`, `parseConsentCookie`, `snapshotConsent`, `shouldDestinationFire`, `EU_COUNTRY_CODES`) stays identical.

- [ ] **Step 3: Write tests**

```ts
// test/server/utils/tracking/consent.test.ts
import { describe, it, expect } from 'vitest'
import { snapshotConsent } from '../../../../server/utils/tracking/consent'

describe('snapshotConsent', () => {
  it('AU visitor with no cookie → tracking granted, analytics/marketing denied', () => {
    const s = snapshotConsent({ consentCookieValue: null, cfIpCountry: 'AU' })
    expect(s.source).toBe('au_implicit_essential')
    expect(s.tracking).toBe('granted')
    expect(s.analytics).toBe('denied')
    expect(s.marketing).toBe('denied')
  })

  it('EU visitor with no cookie → all denied', () => {
    const s = snapshotConsent({ consentCookieValue: null, cfIpCountry: 'DE' })
    expect(s.source).toBe('eu_implicit_deny')
    expect(s.marketing).toBe('denied')
  })

  it('explicit cookie wins regardless of region', () => {
    const cookie = JSON.stringify({ tracking: true, analytics: true, marketing: true, updatedAt: '2026-05-31T00:00:00Z' })
    const s = snapshotConsent({ consentCookieValue: cookie, cfIpCountry: 'DE' })
    expect(s.source).toBe('explicit_cookie')
    expect(s.marketing).toBe('granted')
  })

  it('no region + no cookie → safest deny', () => {
    const s = snapshotConsent({ consentCookieValue: null, cfIpCountry: null })
    expect(s.source).toBe('no_signal')
    expect(s.tracking).toBe('denied')
  })
})
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/consent.test.ts`
Expected: PASS (4 tests). If FAIL on import path, confirm the file copied to `server/utils/tracking/consent.ts`.

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/consent.ts test/server/utils/tracking/consent.test.ts
git commit -m "feat(tracking): port consent snapshot module (AU opt-out default)"
```

---

## Task 4: PII pure modules (`normalize.ts` + `pii-hash.ts`, ported for forward-compat)

Per spec forward-compat: port these pure modules now so Slice 2/3 destination hashing drops in without re-derivation. They are not wired to anything in Slice 1.

**Files:**
- Create: `server/utils/tracking/normalize.ts`, `server/utils/tracking/pii-hash.ts`
- Test: `test/server/utils/tracking/pii-hash.test.ts`

- [ ] **Step 1: Copy both modules**

Run:
```bash
cp /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/server/utils/tracking/normalize.ts server/utils/tracking/normalize.ts
cp /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/server/utils/tracking/pii-hash.ts   server/utils/tracking/pii-hash.ts
```
Both are pure (no `~/` imports except `pii-hash.ts` → `./normalize`, which is a relative import and stays correct). Trim phase-specific doc comments only.

- [ ] **Step 2: Write tests locking the destination-normalisation rules (Pitfall 5)**

```ts
// test/server/utils/tracking/pii-hash.test.ts
import { describe, it, expect } from 'vitest'
import { hashForDest, hashUserDataForDest } from '../../../../server/utils/tracking/pii-hash'
import { normalizeEmailForDest } from '../../../../server/utils/tracking/normalize'

describe('normalizeEmailForDest', () => {
  it('strips gmail dots + alias for ga4 but not for meta', () => {
    expect(normalizeEmailForDest('John.Doe+ads@gmail.com', 'ga4')).toBe('johndoe@gmail.com')
    expect(normalizeEmailForDest('John.Doe+ads@gmail.com', 'meta')).toBe('john.doe+ads@gmail.com')
  })
})

describe('hashForDest', () => {
  it('produces a stable 64-char sha256 hex', async () => {
    const h = await hashForDest('johndoe@gmail.com')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })
  it('returns empty string for falsy input', async () => {
    expect(await hashForDest('')).toBe('')
  })
})

describe('hashUserDataForDest', () => {
  it('only returns keys that had values', async () => {
    const out = await hashUserDataForDest({ email: 'a@b.com' }, 'meta')
    expect(out.em).toMatch(/^[0-9a-f]{64}$/)
    expect(out.ph).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/pii-hash.test.ts`
Expected: PASS. `crypto.subtle` is a Node 19+ global; if it is undefined in the test env, add `import { webcrypto } from 'node:crypto'` shim at the top of the test: `globalThis.crypto ??= webcrypto as any`.

- [ ] **Step 4: Commit**

```bash
git add server/utils/tracking/normalize.ts server/utils/tracking/pii-hash.ts test/server/utils/tracking/pii-hash.test.ts
git commit -m "feat(tracking): port PII normalize + hash modules (forward-compat, unused in Slice 1)"
```

---

## Task 5: Write-key site resolver (`site-config.ts`)

Resolves a write key → `tracking_sites` row, with a short in-memory cache. Replaces the reference's host→KV tenancy. The cache TTL logic is a pure function (testable); the DB fetch is integration-verified.

**Files:**
- Create: `server/utils/tracking/site-config.ts`
- Test: `test/server/utils/tracking/site-config.test.ts`

- [ ] **Step 1: Write the failing test for the pure cache helper**

```ts
// test/server/utils/tracking/site-config.test.ts
import { describe, it, expect } from 'vitest'
import { isOriginAllowed, _cacheIsFresh } from '../../../../server/utils/tracking/site-config'

describe('isOriginAllowed', () => {
  const site = { allowedOrigins: ['https://www.kia.gws.com.au'] } as any
  it('matches an allowed origin', () => {
    expect(isOriginAllowed(site, 'https://www.kia.gws.com.au')).toBe(true)
  })
  it('rejects a foreign origin', () => {
    expect(isOriginAllowed(site, 'https://evil.example.com')).toBe(false)
  })
  it('treats empty allowlist as allow-all (Slice 1 soft mode)', () => {
    expect(isOriginAllowed({ allowedOrigins: [] } as any, 'https://anything')).toBe(true)
  })
})

describe('_cacheIsFresh', () => {
  it('fresh within TTL', () => {
    expect(_cacheIsFresh(1000, 1000 + 60_000, 300_000)).toBe(true)
  })
  it('stale past TTL', () => {
    expect(_cacheIsFresh(1000, 1000 + 400_000, 300_000)).toBe(false)
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `pnpm exec vitest run test/server/utils/tracking/site-config.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the resolver**

```ts
// server/utils/tracking/site-config.ts
/**
 * Write-key tenancy for the cross-origin tracking endpoint.
 *
 * We do NOT host the dealer sites, so we cannot resolve the tenant by request
 * host (the reference's model). Instead the snippet embeds a public write key;
 * we look up tracking_sites by it, with a 5-minute in-memory cache.
 *
 * Origin validation is SOFT in Slice 1: an empty allowlist means allow-all, and
 * the endpoint logs (does not block) a mismatch. Promote to hard 403 once
 * allowlists are proven (see spec Open Questions).
 *
 * NEVER throws — returns null on any DB error so the public endpoint stays a beacon.
 */
import { queryOne } from '~~/server/utils/db'

export interface TrackingSite {
  id: string
  clientId: string
  name: string
  writeKey: string
  allowedOrigins: string[]
  spa: boolean
  consentMode: string
  leadSelectors: string[]
  retentionDays: number
  isActive: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { site: TrackingSite | null; fetchedAt: number }>()

/** Exported for unit testing the freshness window. */
export function _cacheIsFresh(fetchedAt: number, now: number, ttlMs: number): boolean {
  return now - fetchedAt < ttlMs
}

export function isOriginAllowed(site: Pick<TrackingSite, 'allowedOrigins'>, origin: string | null): boolean {
  if (!site.allowedOrigins || site.allowedOrigins.length === 0) return true // soft mode
  if (!origin) return false
  return site.allowedOrigins.includes(origin)
}

function mapRow(row: any): TrackingSite {
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    writeKey: row.write_key,
    allowedOrigins: row.allowed_origins ?? [],
    spa: row.spa,
    consentMode: row.consent_mode,
    leadSelectors: row.lead_selectors ?? [],
    retentionDays: row.retention_days,
    isActive: row.is_active,
  }
}

/**
 * Resolve a write key to an active tracking site. Returns null for unknown /
 * inactive keys or any error. `nowMs` is injectable for tests; defaults to Date.now().
 */
export async function resolveSiteByWriteKey(
  writeKey: string | null | undefined,
  nowMs: number = Date.now(),
): Promise<TrackingSite | null> {
  if (!writeKey) return null
  const cached = cache.get(writeKey)
  if (cached && _cacheIsFresh(cached.fetchedAt, nowMs, CACHE_TTL_MS)) {
    return cached.site
  }
  try {
    const row = await queryOne(
      `SELECT id, client_id, name, write_key, allowed_origins, spa, consent_mode,
              lead_selectors, retention_days, is_active
         FROM tracking_sites
        WHERE write_key = $1 AND is_active = TRUE`,
      [writeKey],
    )
    const site = row ? mapRow(row) : null
    cache.set(writeKey, { site, fetchedAt: nowMs })
    return site
  } catch (err) {
    console.warn('[tracking/site-config] resolveSiteByWriteKey failed:', err)
    return null
  }
}

/** Test/admin hook: drop a cache entry after rotating a key or toggling active. */
export function invalidateSiteCache(writeKey: string): void {
  cache.delete(writeKey)
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/site-config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/site-config.ts test/server/utils/tracking/site-config.test.ts
git commit -m "feat(tracking): write-key site resolver with soft origin allowlist + cache"
```

---

## Task 6: Public collect endpoint (`/api/public/track`)

Models the public `banner-pixel` precedent + the reference's never-throws/64KB discipline. Two extracted pure helpers are unit-tested; the handler itself is verified by curl in Task 10's vertical proof.

**Files:**
- Create: `server/api/public/track.post.ts`, `server/api/public/track.options.ts`
- Create: `server/utils/tracking/event-insert.ts` (pure row-builder, testable)
- Test: `test/server/utils/tracking/event-insert.test.ts`

- [ ] **Step 1: Write the failing test for the row-builder**

```ts
// test/server/utils/tracking/event-insert.test.ts
import { describe, it, expect } from 'vitest'
import { buildEventRows } from '../../../../server/utils/tracking/event-insert'

describe('buildEventRows', () => {
  const site = { id: 'site-1', clientId: 'client-1' } as any
  const ctx = { ua: 'UA', ipHash: 'iphash', origin: 'https://www.kia.gws.com.au', consent: { tracking: 'granted' } }
  const payload = { events: [{
    event_id: 'e1', event_name: 'page_view', anon_id: 'a1', session_id: 's1',
    page_url: 'https://www.kia.gws.com.au/', referrer: null, occurred_at: 1748600000000,
    attribution: { gclid: 'G', utm_source: 'google' }, event_data: { depth: 25 },
  }] } as any

  it('produces one parameter tuple per event with flattened attribution', () => {
    const rows = buildEventRows(site, payload, ctx)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.site_id).toBe('site-1')
    expect(r.client_id).toBe('client-1')
    expect(r.event_id).toBe('e1')
    expect(r.gclid).toBe('G')
    expect(r.utm_source).toBe('google')
    expect(r.origin).toBe('https://www.kia.gws.com.au')
    expect(r.event_data).toEqual({ depth: 25 })
    expect(typeof r.occurred_at).toBe('string') // ISO string for TIMESTAMPTZ
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run test/server/utils/tracking/event-insert.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the row-builder**

```ts
// server/utils/tracking/event-insert.ts
/**
 * Pure transform: validated payload + request context → flat DB rows for
 * tracking_events. No IO. Keeps the endpoint handler thin and testable.
 */
import type { TrackPayload } from './track-schema'
import type { TrackingSite } from './site-config'

export interface EventContext {
  ua: string | null
  ipHash: string | null
  origin: string | null
  consent: unknown
}

export interface TrackingEventRow {
  site_id: string
  client_id: string
  event_id: string
  anon_id: string
  session_id: string | null
  event_name: string
  page_url: string | null
  referrer: string | null
  utm_source: string | null; utm_medium: string | null; utm_campaign: string | null
  utm_term: string | null; utm_content: string | null
  gclid: string | null; gbraid: string | null; wbraid: string | null
  fbclid: string | null; fbc: string | null; fbp: string | null
  ttclid: string | null; msclkid: string | null; li_fat_id: string | null
  event_data: Record<string, unknown>
  consent: unknown
  ua: string | null
  ip_hash: string | null
  origin: string | null
  occurred_at: string | null
}

const ATTR_KEYS = [
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
  'gclid','gbraid','wbraid','fbclid','fbc','fbp','ttclid','msclkid','li_fat_id',
] as const

export function buildEventRows(
  site: Pick<TrackingSite, 'id' | 'clientId'>,
  payload: TrackPayload,
  ctx: EventContext,
): TrackingEventRow[] {
  return payload.events.map(ev => {
    const attr = (ev.attribution ?? {}) as Record<string, string | null | undefined>
    const flat: any = {}
    for (const k of ATTR_KEYS) flat[k] = attr[k] ?? null
    return {
      site_id: site.id,
      client_id: site.clientId,
      event_id: ev.event_id,
      anon_id: ev.anon_id,
      session_id: ev.session_id ?? null,
      event_name: ev.event_name,
      page_url: ev.page_url ?? null,
      referrer: ev.referrer ?? null,
      ...flat,
      event_data: (ev.event_data ?? {}) as Record<string, unknown>,
      consent: ctx.consent,
      ua: ctx.ua,
      ip_hash: ctx.ipHash,
      origin: ctx.origin,
      occurred_at: ev.occurred_at ? new Date(ev.occurred_at).toISOString() : null,
    }
  })
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/event-insert.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the CORS preflight handler**

```ts
// server/api/public/track.options.ts
/** CORS preflight for the public tracking beacon. Echoes the request Origin
 *  (never '*' — credentialed/keepalive beacons require a concrete origin). */
export default defineEventHandler((event) => {
  const origin = getHeader(event, 'origin') || '*'
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  })
  setResponseStatus(event, 204)
  return ''
})
```

- [ ] **Step 6: Implement the collect endpoint**

```ts
// server/api/public/track.post.ts
/**
 * PUBLIC first-party tracking beacon — POST /api/public/track  (Slice 1)
 *
 * No auth. Write key + (soft) Origin allowlist are the only gates. NEVER throws:
 * a 500 = dropped client events. On any failure we still return 200 so the
 * browser beacon appears to succeed. Body capped at 64 KB before readBody.
 *
 * Cross-origin: identity cookies are managed client-side by the tag; we do NOT
 * Set-Cookie here. We resolve the tenant by write key, not request host.
 */
import { execute } from '~~/server/utils/db'
import { parseTrackPayload } from '~~/server/utils/tracking/track-schema'
import { resolveSiteByWriteKey, isOriginAllowed } from '~~/server/utils/tracking/site-config'
import { snapshotConsent } from '~~/server/utils/tracking/consent'
import { buildEventRows } from '~~/server/utils/tracking/event-insert'

async function sha256Hex(value: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch { return '' }
}

export default defineEventHandler(async (event) => {
  const reqOrigin = getHeader(event, 'origin') || null
  // Always set permissive-but-concrete CORS so the beacon response is readable.
  setResponseHeaders(event, {
    'Access-Control-Allow-Origin': reqOrigin || '*',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  })

  try {
    // 1. Write key (query ?k= or body.write_key). Query is preferred (sendBeacon URL).
    const writeKey = (getQuery(event).k as string) || ''
    // 2. Body size cap (64 KB) before parse.
    const contentLength = parseInt(getHeader(event, 'content-length') || '0', 10)
    if (!contentLength || contentLength > 64 * 1024) {
      setResponseStatus(event, 413); return { ok: false }
    }
    // 3. Resolve tenant by write key.
    const site = await resolveSiteByWriteKey(writeKey)
    if (!site) { setResponseStatus(event, 403); return { ok: false } }

    // 4. Parse + validate body.
    const raw = await readBody(event).catch(() => null)
    const parsed = parseTrackPayload(raw)
    if (!parsed.ok) { setResponseStatus(event, 422); return { ok: false, errors: parsed.errors } }

    // 5. Soft origin check — log mismatch, do not block (Slice 1).
    const originOk = isOriginAllowed(site, reqOrigin)
    if (!originOk) console.warn('[track] origin not in allowlist', { site: site.id, reqOrigin })

    // 6. Consent snapshot + request context.
    const consent = snapshotConsent({
      consentCookieValue: getCookie(event, '_xf_consent'),
      cfIpCountry: getHeader(event, 'cf-ipcountry'),
    })
    const ip = getRequestIP(event, { xForwardedFor: true }) || ''
    const ctx = {
      ua: getHeader(event, 'user-agent') || null,
      ipHash: ip ? await sha256Hex(ip) : null,
      origin: reqOrigin,
      consent,
    }

    // 7. Build + insert rows (dedup on (site_id, event_id)).
    const rows = buildEventRows(site, parsed.payload, ctx)
    for (const r of rows) {
      await execute(
        `INSERT INTO tracking_events (
            site_id, client_id, event_id, anon_id, session_id, event_name, page_url, referrer,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            gclid, gbraid, wbraid, fbclid, fbc, fbp, ttclid, msclkid, li_fat_id,
            event_data, consent, ua, ip_hash, origin, occurred_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
                 $23,$24,$25,$26,$27,$28)
         ON CONFLICT (site_id, event_id) DO NOTHING`,
        [
          r.site_id, r.client_id, r.event_id, r.anon_id, r.session_id, r.event_name, r.page_url, r.referrer,
          r.utm_source, r.utm_medium, r.utm_campaign, r.utm_term, r.utm_content,
          r.gclid, r.gbraid, r.wbraid, r.fbclid, r.fbc, r.fbp, r.ttclid, r.msclkid, r.li_fat_id,
          JSON.stringify(r.event_data), JSON.stringify(r.consent), r.ua, r.ip_hash, r.origin, r.occurred_at,
        ],
      )
    }

    setResponseStatus(event, 200)
    return { ok: true, received: rows.length }
  } catch (err) {
    // Beacon semantics: never surface a 5xx to the page.
    console.error('[track] handler error (returning 200):', err)
    setResponseStatus(event, 200)
    return { ok: true }
  }
})
```

- [ ] **Step 7: Commit**

```bash
git add server/utils/tracking/event-insert.ts server/api/public/track.post.ts server/api/public/track.options.ts test/server/utils/tracking/event-insert.test.ts
git commit -m "feat(tracking): public collect endpoint (never-throws, write-key, CORS)"
```

---

## Task 7: The deployable tag (`public/track.js`)

Port the proven `tracking.js`, trim heavy behavioural defaults, and rewire transport for cross-origin write-key delivery. The tag is a vendored browser IIFE — verified by browser smoke-test (Task 10), not unit tests.

**Files:**
- Create: `public/track.js`

- [ ] **Step 1: Copy the reference tag**

Run:
```bash
cp /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/layers/widgets/public/tracking.js public/track.js
```

- [ ] **Step 2: Rewire the endpoint to cross-origin + write key**

In `public/track.js`, locate `var ENDPOINT = '/api/tracking/collect'` (near the top config block) and change the send path so events POST to **our** origin with the write key. Two edits:

  (a) Change the default:
```js
  // BEFORE
  var ENDPOINT = '/api/tracking/collect'
  // AFTER
  var ENDPOINT = '/api/public/track'   // resolved against _scriptOrigin at send time
```
  (b) In the function that performs the network send (search for `sendBeacon` / the `fetch(` that posts to `ENDPOINT`), build an absolute URL with the write key and batch shape:
```js
  // url used by sendBeacon/fetch:
  var url = (_scriptOrigin || '') + ENDPOINT + '?k=' + encodeURIComponent(WRITE_KEY)
  // body must be the Slice-1 batch shape: { events: [ ... ] } with anon_id/session_id on each event
```

- [ ] **Step 3: Read the write key + spa flag from the script tag**

Near the `init()` config resolution (where `document.currentScript` is read for `_scriptOrigin`), add:
```js
  var WRITE_KEY = ''
  if (scriptEl) {
    WRITE_KEY = scriptEl.getAttribute('data-key') || ''
    if (scriptEl.getAttribute('data-spa') === 'true') config.spa = true
  }
```
If `WRITE_KEY` is empty, `console.warn('[track] missing data-key')` and skip sending (still no-throw).

- [ ] **Step 4: Map internal event names + ensure each event carries identity**

Ensure the per-event payload built before send includes `event_id`, `event_name`, `anon_id` (from `getClientId()`), `session_id` (from `getSessionId()`), `page_url`, `referrer`, `occurred_at` (ms), `attribution` (the captured click-IDs/UTMs), and `event_data`. Confirm the tag's internal event names are within `TRACK_EVENT_NAMES` (Task 2) — in particular it already emits `page_view`, `scroll`, `engagement`, `phone_click`, `form_submit`. If any internal name is outside the set (e.g. `form_start`/`form_abandonment` exist; `vehicle_view` only fires when configured), they are already reserved in the schema.

- [ ] **Step 5: Default heavy behavioural signals OFF**

Confirm `config.behavioral` defaults to falsy (it does in the reference — rage/video/idle/competitive-referrer are opt-in). Keep `clicks`, `forms`, `scroll`, `engagement` on by default. Do not enable `behavioral` in Slice 1.

- [ ] **Step 6: Rename the global API (avoid clashing with any existing engagr tag on the dealer site)**

Replace `window.engagrTrack` with `window.xf` and update the auto-init footer + the `data-auto` check to reference the same. (A dealer site might already run the reference tag; a distinct global prevents collisions.)

- [ ] **Step 7: Local smoke test (happy path, no DB yet)**

Create a throwaway `public/track-test.html`:
```html
<!doctype html><html><head>
<script src="/track.js" data-key="TESTKEY" data-spa="false" async></script>
</head><body><h1>tag test</h1>
<a href="tel:+61399999999">call us</a>
</body></html>
```
Run `pnpm dev`, open `http://localhost:3000/track-test.html`, open DevTools → Network. Expected: a `POST /api/public/track?k=TESTKEY` beacon fires on load (it will 403 until a real site row exists — that's fine here; you're verifying the tag *sends* the right shape). Inspect the request payload: it must be `{ events: [{ event_id, event_name:'page_view', anon_id, session_id, page_url, ... }] }`. Delete `public/track-test.html` after.

- [ ] **Step 8: Commit**

```bash
git add public/track.js
git commit -m "feat(tracking): deployable tag — cross-origin write-key transport, behavioural defaults trimmed"
```

---

## Task 8: Provisioning API (`server/api/agency/tracking/`)

CRUD for `tracking_sites`, RBAC-gated. The write-key generator is a pure, tested helper.

**Files:**
- Create: `server/utils/tracking/write-key.ts`
- Create: `server/api/agency/tracking/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id]/rotate-key.post.ts`, `[id]/snippet.get.ts`
- Test: `test/server/utils/tracking/write-key.test.ts`

- [ ] **Step 1: Write the failing test for the key generator**

```ts
// test/server/utils/tracking/write-key.test.ts
import { describe, it, expect } from 'vitest'
import { generateWriteKey } from '../../../../server/utils/tracking/write-key'

describe('generateWriteKey', () => {
  it('has the xf_ prefix and is URL-safe', () => {
    const k = generateWriteKey()
    expect(k).toMatch(/^xf_[A-Za-z0-9_-]{24,}$/)
  })
  it('is unique across calls', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateWriteKey()))
    expect(set.size).toBe(100)
  })
})
```

- [ ] **Step 2: Run — verify fail**

Run: `pnpm exec vitest run test/server/utils/tracking/write-key.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the generator**

```ts
// server/utils/tracking/write-key.ts
/** Public, embeddable per-site write key. URL-safe base64 of 18 random bytes. */
export function generateWriteKey(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  let b64 = btoa(String.fromCharCode(...bytes))
  b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return 'xf_' + b64
}
```

- [ ] **Step 4: Run — verify pass**

Run: `pnpm exec vitest run test/server/utils/tracking/write-key.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the endpoints**

```ts
// server/api/agency/tracking/index.get.ts
/** List tracking sites (optionally ?clientId=). GET /api/agency/tracking */
import { query } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const { clientId } = getQuery(event) as { clientId?: string }
  const rows = await query(
    `SELECT s.*, (
        SELECT COUNT(*) FROM tracking_events e
         WHERE e.site_id = s.id AND e.received_at > NOW() - INTERVAL '24 hours'
      ) AS events_24h
       FROM tracking_sites s
      ${clientId ? 'WHERE s.client_id = $1' : ''}
      ORDER BY s.created_at DESC`,
    clientId ? [clientId] : [],
  )
  return { sites: rows }
})
```

```ts
// server/api/agency/tracking/index.post.ts
/** Create a tracking site. POST /api/agency/tracking */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { generateWriteKey } from '~~/server/utils/tracking/write-key'

interface Body {
  clientId: string
  name: string
  allowedOrigins?: string[]
  spa?: boolean
  consentMode?: string
  leadSelectors?: string[]
  retentionDays?: number
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const body = await readBody<Body>(event)
  if (!body?.clientId || !body?.name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'clientId and name are required' })
  }
  const row = await queryOne(
    `INSERT INTO tracking_sites (client_id, name, write_key, allowed_origins, spa, consent_mode, lead_selectors, retention_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      body.clientId, body.name.trim(), generateWriteKey(),
      body.allowedOrigins ?? [], body.spa ?? false, body.consentMode ?? 'off',
      body.leadSelectors ?? [], body.retentionDays ?? 395,
    ],
  )
  return { site: row }
})
```

```ts
// server/api/agency/tracking/[id].patch.ts
/** Update tracking site config. PATCH /api/agency/tracking/:id */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { invalidateSiteCache } from '~~/server/utils/tracking/site-config'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const id = getRouterParam(event, 'id')
  const body = await readBody<Record<string, unknown>>(event)
  const allowed = ['name', 'allowed_origins', 'spa', 'consent_mode', 'lead_selectors', 'retention_days', 'is_active']
  const sets: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(body || {})) {
    const col = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    if (allowed.includes(col)) { params.push(v); sets.push(`${col} = $${params.length}`) }
  }
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'No updatable fields' })
  params.push(id)
  const row = await queryOne(
    `UPDATE tracking_sites SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params,
  ) as any
  if (row?.write_key) invalidateSiteCache(row.write_key)
  return { site: row }
})
```

```ts
// server/api/agency/tracking/[id]/rotate-key.post.ts
/** Rotate the write key. POST /api/agency/tracking/:id/rotate-key */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'
import { generateWriteKey } from '~~/server/utils/tracking/write-key'
import { invalidateSiteCache } from '~~/server/utils/tracking/site-config'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager'])
  const id = getRouterParam(event, 'id')
  const existing = await queryOne(`SELECT write_key FROM tracking_sites WHERE id = $1`, [id]) as any
  const row = await queryOne(
    `UPDATE tracking_sites SET write_key = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [generateWriteKey(), id],
  ) as any
  if (existing?.write_key) invalidateSiteCache(existing.write_key)
  return { site: row }
})
```

```ts
// server/api/agency/tracking/[id]/snippet.get.ts
/** Render the install snippet for a site. GET /api/agency/tracking/:id/snippet */
import { queryOne } from '~~/server/utils/db'
import { requireAuth, requireRole } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  await requireRole(event, ['owner', 'admin', 'lead', 'project_manager', 'media_buyer', 'account_manager'])
  const id = getRouterParam(event, 'id')
  const site = await queryOne(`SELECT write_key, spa FROM tracking_sites WHERE id = $1`, [id]) as any
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Site not found' })
  const origin = getRequestProtocol(event) + '://' + getRequestHost(event)
  const spaAttr = site.spa ? ' data-spa="true"' : ''
  const raw = `<script src="${origin}/track.js" data-key="${site.write_key}"${spaAttr} async></script>`
  return {
    writeKey: site.write_key,
    raw,
    gtm: `In GTM → Tags → New → Custom HTML, paste:\n${raw}\nTrigger: All Pages (Window Loaded).`,
  }
})
```

- [ ] **Step 6: Smoke-test create + list via curl** (needs a logged-in session cookie; or test in the UI in Task 9). Minimal DB check the create worked:

Run (after creating one in the UI):
```bash
psql "$DATABASE_URL" -c "SELECT id, name, write_key, spa FROM tracking_sites ORDER BY created_at DESC LIMIT 3"
```
Expected: your new row with an `xf_…` key.

- [ ] **Step 7: Commit**

```bash
git add server/utils/tracking/write-key.ts server/api/agency/tracking test/server/utils/tracking/write-key.test.ts
git commit -m "feat(tracking): provisioning API (CRUD + key rotation + snippet) with RBAC"
```

---

## Task 9: Provisioning UI (`/agency/tracking`)

Nuxt UI v4. List sites with 24h event counts, create via slideover, show the install snippet. **Invoke the `frontend-design` skill before building the form** (project rule). Verified manually.

**Files:**
- Create: `app/pages/agency/tracking/index.vue`
- Create: `app/components/tracking/SiteCreateSlideover.vue`
- Create: `app/components/tracking/InstallSnippet.vue`
- Modify (if an agency nav/menu exists): add a link to `/agency/tracking`.

- [ ] **Step 1: Invoke `frontend-design` skill** and apply its principles to the create form (typography, hierarchy, spacing).

- [ ] **Step 2: Build the list page** (`app/pages/agency/tracking/index.vue`)

Requirements (use Nuxt UI v4 components only):
- `useFetch('/api/agency/tracking')` → render a `UTable` (`{ accessorKey, header }` columns) with: Client/site name, write key (truncated + copy), `spa` badge, `events_24h` count, Actions.
- A "New tracking site" `UButton` opens `SiteCreateSlideover`.
- Row action "Install" opens a `UModal` containing `<InstallSnippet :site-id="row.original.id" />`.
- Empty state when no sites.

- [ ] **Step 3: Build the create slideover** (`app/components/tracking/SiteCreateSlideover.vue`)

- `USlideover` with `UFormField`-wrapped controls: client (`USelectMenu` of agency clients — fetch `/api/agency/clients`; never empty-string values), name (`UInput`), allowed origins (`UInput` per origin or a simple comma-split textarea → array), `spa` (`UCheckbox`), consent mode (`USelect`: `off`/`au_optout`/`consent_gated`), retention days (`UInput type=number`).
- Submit → `$fetch('/api/agency/tracking', { method: 'POST', body })` → toast success → emit refresh.

- [ ] **Step 4: Build the snippet component** (`app/components/tracking/InstallSnippet.vue`)

- `useFetch('/api/agency/tracking/' + props.siteId + '/snippet')`.
- Show the raw `<script>` in a `UTextarea`/code block with a copy `UButton` (`useToast` on copy).
- Show the GTM instructions block.
- A short note: "kia.gws → raw or GTM, spa off · kevindennisvw / ferntreegully → GTM, spa on."

- [ ] **Step 5: Manual verification**

Run `pnpm dev`. Visit `/agency/tracking`. Create a site for a real client. Confirm: row appears, write key shows, Install modal renders a valid `<script src="…/track.js" data-key="xf_…">`. Confirm `tracking_sites` row exists (psql from Task 8 Step 6).

- [ ] **Step 6: Commit**

```bash
git add app/pages/agency/tracking app/components/tracking
git commit -m "feat(tracking): agency provisioning UI (list, create, install snippet)"
```

---

## Task 10: Retention, vertical proof, and three-site rollout

**Files:**
- Create: `server/api/cron/tracking-retention.post.ts` (simple purge; cron wired in CF dashboard later)

- [ ] **Step 1: Implement the retention purge**

```ts
// server/api/cron/tracking-retention.post.ts
/** Purge tracking_events older than each site's retention_days. Cron-gated.
 *  Wire in CF dashboard: POST with header x-cron-secret: $CRON_SECRET, daily. */
import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  const deleted = await execute(
    `DELETE FROM tracking_events e
       USING tracking_sites s
      WHERE e.site_id = s.id
        AND e.received_at < NOW() - (s.retention_days || ' days')::interval`,
  )
  return { ok: true, deleted }
})
```

- [ ] **Step 2: Commit the retention job**

```bash
git add server/api/cron/tracking-retention.post.ts
git commit -m "feat(tracking): retention purge cron endpoint"
```

- [ ] **Step 3: VERTICAL PROOF — one real event end-to-end (kia, simplest/MPA)**

1. In `/agency/tracking`, create a site for the Kia client: name "GWS Kia", allowed origins `https://www.kia.gws.com.au`, `spa=false`. Copy the write key.
2. With `pnpm dev` running, simulate a real beacon locally (replace KEY):
```bash
curl -i -X POST "http://localhost:3000/api/public/track?k=KEY" \
  -H 'Content-Type: application/json' \
  -H 'Origin: https://www.kia.gws.com.au' \
  --data '{"events":[{"event_id":"proof1","event_name":"page_view","anon_id":"a1","session_id":"s1","page_url":"https://www.kia.gws.com.au/","occurred_at":1748600000000,"attribution":{"gclid":"G1","utm_source":"google"}}]}'
```
Expected: `HTTP/1.1 200` and body `{"ok":true,"received":1}`.
3. Confirm it landed:
```bash
psql "$DATABASE_URL" -c "SELECT event_id, event_name, gclid, origin FROM tracking_events WHERE event_id='proof1'"
```
Expected: one row, `gclid=G1`, `origin=https://www.kia.gws.com.au`.
4. Idempotency: re-run the same curl → still exactly one row (ON CONFLICT DO NOTHING).

**Do not proceed to live install until this proof passes.**

- [ ] **Step 4: Deploy the tag + endpoint**

```bash
pnpm deploy:production
```
Verify the tag is reachable: `curl -I https://<dashboard-domain>/track.js` → `200`, `content-type: ...javascript`.

- [ ] **Step 5: Live install — kia.gws (WordPress / AdTorque, MPA)**

Install the snippet via GTM container `GTM-KDV5LJS` (Custom HTML, All Pages) **or** raw `<script>` in the WP/AdTorque head. `spa=false`. Load the live site, DevTools → Network: confirm a `200` beacon to `…/api/public/track?k=…`. Confirm rows arrive:
```bash
psql "$DATABASE_URL" -c "SELECT event_name, COUNT(*) FROM tracking_events e JOIN tracking_sites s ON s.id=e.site_id WHERE s.name='GWS Kia' GROUP BY event_name"
```

- [ ] **Step 6: Live install — kevindennisvw (Gatsby/SPA) and ferntreegully (Next.js/SPA)**

Create both sites (`spa=true`). Install via each site's GTM container (iMotor-managed; Dealer Studio `GTM-TF9X4HB`). Because these are SPAs, verify a **route change** (click an in-site link) also fires a `page_view` beacon. Confirm the 24h count climbs in `/agency/tracking` for each.

- [ ] **Step 7: Final commit / wrap**

```bash
git add -A && git commit -m "chore(tracking): Slice 1 rollout notes" --allow-empty
```
Update the spec's rollout checklist if any per-site detail differed (GTM ownership, CSP).

**Slice 1 done when:** the vertical proof passes, the tag is live on all three sites, `/agency/tracking` shows climbing 24h counts, and `pnpm exec vitest run test/server/utils/tracking` is green.

---

## Self-review

- **Spec coverage:** tag (Task 7) · `public/track.js` bootstrap+key (7) · collect endpoint never-throws/64KB/origin/consent (6) · CORS (6) · write-key tenancy (5) · migration 125 tracking_sites+tracking_events (1) · behaviour schema mandatory event_id (2) · consent AU default (3) · pii-hash/normalize forward-compat (4) · provisioning UI+API+snippet (8,9) · `spa` per-site (1,7,8,9) · retention (10) · vertical-proof-first (10) · three-site rollout matrix (10). Forward-compat reserved event names (2) + queryable events table (1). Slices 2–5 explicitly untouched. ✅
- **Placeholder scan:** net-new code shown in full (migration, schema, consent tests, site-config, event-insert, endpoint, write-key, provisioning endpoints, retention). Ports use exact `cp` source/dest + precise diffs. No "TBD"/"handle errors"/"similar to". ✅
- **Type consistency:** `TrackingSite`/`TrackPayload`/`TrackingEventRow` flow consistently: `resolveSiteByWriteKey`→`TrackingSite` used by `buildEventRows` (`id`,`clientId`) and `isOriginAllowed`; `parseTrackPayload`→`TrackPayload` used by `buildEventRows`; `generateWriteKey` used by create + rotate; `invalidateSiteCache` called on patch/rotate. Endpoint INSERT column order matches the 28-param tuple and the migration columns. ✅
- **Known risk to watch during execution:** the endpoint handler isn't unit-tested (needs Nitro harness) — its correctness rests on the Task-10 curl proof + the unit-tested pure helpers (`buildEventRows`, `isOriginAllowed`, `parseTrackPayload`). Acceptable for a beacon; flagged.
