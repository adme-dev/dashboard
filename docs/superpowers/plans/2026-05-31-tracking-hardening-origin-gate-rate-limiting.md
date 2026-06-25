# Tracking Hardening — Hard Origin Gate + Layered Rate Limiting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the public `/api/public/track` beacon with a per-site hard Origin gate and globally-accurate layered rate limiting (per-write_key ceiling + per-IP burst), shipped in a safe `shadow → enforce` rollout.

**Architecture:** A new standalone Cloudflare Worker (`rate-limiter-worker`) exports a `RateLimiter` Durable Object — one instance per write key — that holds a sliding-window counter for the key ceiling plus a bounded-LRU map of per-IP windows. The Pages function (`track.post.ts`) calls it once per beacon (fail-open), and enforces a per-site `enforce_origin` flag. All new gates degrade to no-ops when the DO binding is absent (dev) or the mode env is `off`/`shadow`.

**Tech Stack:** Cloudflare Pages + Workers + Durable Objects, Nitro (h3) server routes, Neon Postgres, Vitest, Nuxt UI v4 (Vue 3 `<script setup>`).

**Spec:** `docs/superpowers/specs/2026-05-31-tracking-hardening-origin-gate-rate-limiting-design.md`

**Working branch:** `feat/tracking-hardening` (off `origin/main` @ `789220d`).

**Note on the spec's UI assumption:** the spec named `SiteCreateSlideover.vue` as a "create/edit" surface. In reality it is **create-only**, and **no per-site edit UI calls PATCH today**. This plan therefore: adds the `enforce_origin` toggle to the create slideover (new sites), flips **existing** sites via SQL during rollout (same operational path as populating `allowed_origins`), and keeps the `[id].patch.ts` field add for a future edit UI.

---

### Task 1: Migration 139 — `enforce_origin` column

**Files:**
- Create: `server/database/migrations/139-tracking-enforce-origin.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 139-tracking-enforce-origin.sql
-- Per-site hard Origin enforcement flag for the public tracking beacon.
-- Additive + idempotent. Default FALSE so every existing site stays in soft mode.
ALTER TABLE tracking_sites
  ADD COLUMN IF NOT EXISTS enforce_origin BOOLEAN NOT NULL DEFAULT FALSE;
```

- [ ] **Step 2: Run it against the database**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/139-tracking-enforce-origin.sql
```
Expected: `ALTER TABLE`.

- [ ] **Step 3: Verify the column exists**

Run:
```bash
psql "$DATABASE_URL" -c "\d tracking_sites" | grep enforce_origin
```
Expected: a row `enforce_origin | boolean | not null | false`.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/139-tracking-enforce-origin.sql
git commit -m "feat(tracking): migration 139 — enforce_origin column"
```

> **Migration-number check:** 139 clears all known in-flight migrations (CRM 134/135/138, email 136/137). If a 139 collision appears at merge time, renumber to the next free number and re-run.

---

### Task 2: `site-config.ts` — `enforceOrigin` field + `shouldBlockOrigin` pure helper

**Files:**
- Modify: `server/utils/tracking/site-config.ts`
- Test: `test/server/utils/tracking/site-config.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/server/utils/tracking/site-config.test.ts` (and add `shouldBlockOrigin` to the existing import line at the top so it reads `import { isOriginAllowed, _cacheIsFresh, shouldBlockOrigin } from '...'`):

```ts
describe('shouldBlockOrigin', () => {
  const enforcing = { allowedOrigins: ['https://www.kia.gws.com.au'], enforceOrigin: true } as any
  it('blocks a foreign origin when enforcing with a populated allowlist', () => {
    expect(shouldBlockOrigin(enforcing, 'https://evil.example.com', undefined)).toBe(true)
  })
  it('allows a listed origin when enforcing', () => {
    expect(shouldBlockOrigin(enforcing, 'https://www.kia.gws.com.au', undefined)).toBe(false)
  })
  it('never blocks when enforce_origin is false (per-site soft default)', () => {
    expect(shouldBlockOrigin({ allowedOrigins: ['https://x.com'], enforceOrigin: false } as any, 'https://evil.com', undefined)).toBe(false)
  })
  it('never blocks an empty allowlist even when enforcing (allow-all)', () => {
    expect(shouldBlockOrigin({ allowedOrigins: [], enforceOrigin: true } as any, 'https://anything', undefined)).toBe(false)
  })
  it('global TRACKING_ORIGIN_MODE=soft override never blocks', () => {
    expect(shouldBlockOrigin(enforcing, 'https://evil.example.com', 'soft')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/server/utils/tracking/site-config.test.ts`
Expected: FAIL — `shouldBlockOrigin is not a function` (and TS: `enforceOrigin` not on type).

- [ ] **Step 3: Implement the changes in `site-config.ts`**

3a. Add `enforceOrigin` to the interface (after `allowedOrigins`):
```ts
  allowedOrigins: string[]
  enforceOrigin: boolean
```

3b. Add the pure decision helper directly below the existing `isOriginAllowed` function:
```ts
/**
 * Should this request be hard-blocked (403) on Origin?
 * - Empty allowlist ⇒ allow-all ⇒ never blocks (safe for un-configured sites).
 * - Per-site enforce_origin must be true to block at all (default false = soft/log-only).
 * - globalMode === 'soft' (env TRACKING_ORIGIN_MODE) is a global emergency override.
 * Pure + injectable for tests.
 */
export function shouldBlockOrigin(
  site: Pick<TrackingSite, 'allowedOrigins' | 'enforceOrigin'>,
  origin: string | null,
  globalMode: string | undefined,
): boolean {
  if (globalMode === 'soft') return false
  if (!site.enforceOrigin) return false
  return !isOriginAllowed(site, origin)
}
```

3c. Map the new column in `mapRow` (after `allowedOrigins`):
```ts
    allowedOrigins: row.allowed_origins ?? [],
    enforceOrigin: row.enforce_origin ?? false,
```

3d. Add `enforce_origin` to the SELECT column list in `resolveSiteByWriteKey`:
```ts
      `SELECT id, client_id, name, write_key, allowed_origins, enforce_origin, spa, consent_mode,
              lead_selectors, retention_days, is_active
         FROM tracking_sites
        WHERE write_key = $1 AND is_active = TRUE`,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/server/utils/tracking/site-config.test.ts`
Expected: PASS (existing `isOriginAllowed` + `_cacheIsFresh` + new `shouldBlockOrigin` blocks).

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/site-config.ts test/server/utils/tracking/site-config.test.ts
git commit -m "feat(tracking): enforceOrigin field + shouldBlockOrigin decision helper"
```

---

### Task 3: `rate-limiter-worker` pure logic — sliding window + LRU

**Files:**
- Create: `workers/rate-limiter/src/sliding-window.ts`
- Test: `test/workers/rate-limiter/sliding-window.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/workers/rate-limiter/sliding-window.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { newWindow, checkAndCount, LruMap, type WindowState } from '../../../workers/rate-limiter/src/sliding-window'

describe('checkAndCount', () => {
  it('allows up to the limit within one window, then denies', () => {
    const s: WindowState = newWindow(0)
    const t = 1_000_000
    for (let i = 0; i < 3; i++) {
      expect(checkAndCount(s, t, 3, 10_000).allowed).toBe(true)
    }
    const denied = checkAndCount(s, t, 3, 10_000)
    expect(denied.allowed).toBe(false)
    expect(denied.retryAfterSec).toBeGreaterThan(0)
  })

  it('refills after the window fully elapses', () => {
    const s: WindowState = newWindow(0)
    const t = 1_000_000
    for (let i = 0; i < 3; i++) checkAndCount(s, t, 3, 10_000)
    expect(checkAndCount(s, t, 3, 10_000).allowed).toBe(false)
    // two full windows later: prev+curr both cleared
    expect(checkAndCount(s, t + 20_001, 3, 10_000).allowed).toBe(true)
  })

  it('weights the previous window (no hard reset at the boundary)', () => {
    const s: WindowState = newWindow(0)
    const t = 1_000_000
    for (let i = 0; i < 3; i++) checkAndCount(s, t, 3, 10_000)
    // one window later, ~start of new window: prevCount=3 weighted ~1.0 ⇒ still over limit
    expect(checkAndCount(s, t + 10_001, 3, 10_000).allowed).toBe(false)
  })
})

describe('LruMap', () => {
  it('evicts the least-recently-set entry past capacity', () => {
    const m = new LruMap<number>(2)
    m.set('a', 1); m.set('b', 2); m.set('c', 3) // 'a' evicted
    expect(m.get('a')).toBeUndefined()
    expect(m.get('b')).toBe(2)
    expect(m.get('c')).toBe(3)
    expect(m.size).toBe(2)
  })
  it('re-setting a key refreshes its recency', () => {
    const m = new LruMap<number>(2)
    m.set('a', 1); m.set('b', 2); m.set('a', 11); m.set('c', 3) // 'b' evicted, 'a' kept
    expect(m.get('b')).toBeUndefined()
    expect(m.get('a')).toBe(11)
    expect(m.get('c')).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run test/workers/rate-limiter/sliding-window.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `workers/rate-limiter/src/sliding-window.ts`**

```ts
/**
 * Pure rate-limit primitives for the RateLimiter Durable Object.
 * No `cloudflare:workers` imports so this stays unit-testable under node vitest.
 */

export interface WindowState {
  windowStart: number
  currCount: number
  prevCount: number
}

export function newWindow(now: number): WindowState {
  return { windowStart: now, currCount: 0, prevCount: 0 }
}

/** Roll the window forward to `now`, carrying the previous bucket for weighting. */
function roll(s: WindowState, now: number, windowMs: number): void {
  const elapsed = now - s.windowStart
  if (elapsed >= 2 * windowMs) {
    s.prevCount = 0
    s.currCount = 0
    s.windowStart = now
  } else if (elapsed >= windowMs) {
    s.prevCount = s.currCount
    s.currCount = 0
    s.windowStart += windowMs
  }
}

/**
 * Sliding-window-counter check. Rolls the window, computes the weighted estimate,
 * and (on allow) increments the current bucket. Returns the verdict.
 */
export function checkAndCount(
  s: WindowState,
  now: number,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  roll(s, now, windowMs)
  const elapsedInCurr = now - s.windowStart
  const prevWeight = Math.max(0, 1 - elapsedInCurr / windowMs)
  const estimated = s.currCount + s.prevCount * prevWeight
  if (estimated + 1 > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((s.windowStart + windowMs - now) / 1000))
    return { allowed: false, retryAfterSec }
  }
  s.currCount += 1
  return { allowed: true, retryAfterSec: 0 }
}

/** Bounded insertion-ordered LRU. `set` bumps recency; oldest is evicted past `cap`. */
export class LruMap<V> {
  private map = new Map<string, V>()
  constructor(private cap: number) {}

  get(key: string): V | undefined {
    return this.map.get(key)
  }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value as string | undefined
      if (oldest !== undefined) this.map.delete(oldest)
    }
  }

  get size(): number {
    return this.map.size
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run test/workers/rate-limiter/sliding-window.test.ts`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add workers/rate-limiter/src/sliding-window.ts test/workers/rate-limiter/sliding-window.test.ts
git commit -m "feat(rate-limiter): pure sliding-window counter + bounded LRU"
```

---

### Task 4: `rate-limiter-worker` — Durable Object class + entry + config

**Files:**
- Create: `workers/rate-limiter/src/RateLimiter.ts`
- Create: `workers/rate-limiter/src/index.ts`
- Create: `workers/rate-limiter/package.json`
- Create: `workers/rate-limiter/tsconfig.json`
- Create: `workers/rate-limiter/wrangler.toml`

> No vitest step: the DO class needs the workerd runtime (`cloudflare:workers`) and can't run under node vitest. Its logic is fully covered by Task 3's pure tests; end-to-end behaviour is verified by the shadow-mode curl in Task 11.

- [ ] **Step 1: Write the DO class `workers/rate-limiter/src/RateLimiter.ts`**

```ts
/**
 * RateLimiter Durable Object — one instance per tracking write key
 * (`env.RATE_LIMITER.idFromName(writeKey)`).
 *
 * Holds a sliding-window counter for the per-key ceiling plus a bounded-LRU map
 * of per-ip_hash windows for the burst cap. Strongly consistent (single-threaded
 * per instance) — this is what KV/CF-native rate limiting cannot provide globally.
 *
 * Accessed only via the binding (stub.fetch → this.fetch). POST /check with
 * { ipHash, keyLimit, ipLimit, windowMs } → { allowed, layer?, retryAfterSec? }.
 */
import { DurableObject } from 'cloudflare:workers'
import { newWindow, checkAndCount, LruMap, type WindowState } from './sliding-window'

interface Env {}

interface CheckBody {
  ipHash: string | null
  keyLimit: number
  ipLimit: number
  windowMs: number
}

const IP_BUCKET_CAP = 5_000

export class RateLimiter extends DurableObject<Env> {
  private keyWindow: WindowState = newWindow(0)
  private ipWindows = new LruMap<WindowState>(IP_BUCKET_CAP)

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname !== '/check') {
      return new Response('Not found', { status: 404 })
    }
    const body = (await request.json()) as CheckBody
    const now = Date.now()

    // Layer 1 — per-key ceiling (checked first; a key-deny does not consume IP budget).
    const keyVerdict = checkAndCount(this.keyWindow, now, body.keyLimit, body.windowMs)
    if (!keyVerdict.allowed) {
      return Response.json({ allowed: false, layer: 'key', retryAfterSec: keyVerdict.retryAfterSec })
    }

    // Layer 2 — per-IP burst (only when an ip_hash is present).
    if (body.ipHash) {
      const ipState = this.ipWindows.get(body.ipHash) ?? newWindow(now)
      const ipVerdict = checkAndCount(ipState, now, body.ipLimit, body.windowMs)
      this.ipWindows.set(body.ipHash, ipState) // refreshes LRU recency
      if (!ipVerdict.allowed) {
        return Response.json({ allowed: false, layer: 'ip', retryAfterSec: ipVerdict.retryAfterSec })
      }
    }

    return Response.json({ allowed: true })
  }
}
```

- [ ] **Step 2: Write the entry `workers/rate-limiter/src/index.ts`**

```ts
/**
 * rate-limiter-worker entry. Exports the RateLimiter DO class so the Pages
 * project can bind it. Direct fetches aren't used (access is via the binding).
 */
import { RateLimiter } from './RateLimiter'

interface Env {
  RATE_LIMITER: DurableObjectNamespace<RateLimiter>
}

export { RateLimiter }

export default {
  async fetch(): Promise<Response> {
    return new Response('rate-limiter-worker: use the RATE_LIMITER binding', { status: 404 })
  },
} satisfies ExportedHandler<Env>
```

- [ ] **Step 3: Write `workers/rate-limiter/package.json`**

```json
{
  "name": "rate-limiter-worker",
  "private": true,
  "engines": {
    "node": ">=24.0.0"
  },
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "devDependencies": {
    "@cloudflare/workers-types": "^4.20241205.0",
    "wrangler": "^4.99.0"
  }
}
```

- [ ] **Step 4: Write `workers/rate-limiter/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 5: Write `workers/rate-limiter/wrangler.toml`**

```toml
name = "rate-limiter-worker"
main = "src/index.ts"
compatibility_date = "2024-12-01"
compatibility_flags = ["nodejs_compat"]

[durable_objects]
bindings = [{ name = "RATE_LIMITER", class_name = "RateLimiter" }]

[[migrations]]
tag = "v1"
new_classes = ["RateLimiter"]
```

- [ ] **Step 6: Typecheck the worker compiles**

Run: `cd workers/rate-limiter && pnpm install && pnpm exec tsc --noEmit; cd ../..`
Expected: no type errors. (Install is fast with the warm pnpm store.)

- [ ] **Step 7: Commit**

```bash
git add workers/rate-limiter
git commit -m "feat(rate-limiter): RateLimiter Durable Object worker"
```

---

### Task 5: Pages-side `rateCheck` helper

**Files:**
- Create: `server/utils/tracking/rate-limit.ts`
- Test: `test/server/utils/tracking/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/server/utils/tracking/rate-limit.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { rateCheck } from '../../../../server/utils/tracking/rate-limit'

function fakeLimiter(verdict: any) {
  const calls: any = { idFromName: vi.fn((n: string) => ({ name: n })), body: null as any }
  const ns = {
    idFromName: calls.idFromName,
    get: () => ({
      fetch: async (_url: any, init: any) => {
        calls.body = JSON.parse(init.body)
        return Response.json(verdict)
      },
    }),
  }
  return { ns, calls }
}

describe('rateCheck', () => {
  it('routes by write key and forwards limits', async () => {
    const { ns, calls } = fakeLimiter({ allowed: true })
    const v = await rateCheck(ns as any, { writeKey: 'wk_abc', ipHash: 'h1', keyLimit: 600, ipLimit: 60, windowMs: 10_000 })
    expect(v.allowed).toBe(true)
    expect(calls.idFromName).toHaveBeenCalledWith('wk_abc')
    expect(calls.body).toEqual({ ipHash: 'h1', keyLimit: 600, ipLimit: 60, windowMs: 10_000 })
  })

  it('parses a deny verdict', async () => {
    const { ns } = fakeLimiter({ allowed: false, layer: 'ip', retryAfterSec: 7 })
    const v = await rateCheck(ns as any, { writeKey: 'wk', ipHash: null, keyLimit: 1, ipLimit: 1, windowMs: 10_000 })
    expect(v).toEqual({ allowed: false, layer: 'ip', retryAfterSec: 7 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run test/server/utils/tracking/rate-limit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/utils/tracking/rate-limit.ts`**

```ts
/**
 * Pages-side helper to consult the RateLimiter Durable Object once per beacon.
 * Routes to the per-write_key DO instance and returns its verdict. The caller
 * (track.post.ts) owns mode/limits config and fail-open handling.
 */

export interface RateVerdict {
  allowed: boolean
  layer?: 'key' | 'ip'
  retryAfterSec?: number
}

/** Minimal structural type for the DurableObjectNamespace binding we use. */
export interface RateLimiterNamespace {
  idFromName(name: string): unknown
  get(id: unknown): { fetch(input: string, init?: RequestInit): Promise<Response> }
}

export async function rateCheck(
  limiter: RateLimiterNamespace,
  opts: { writeKey: string; ipHash: string | null; keyLimit: number; ipLimit: number; windowMs: number },
): Promise<RateVerdict> {
  const stub = limiter.get(limiter.idFromName(opts.writeKey))
  const res = await stub.fetch('https://rate-limiter/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ipHash: opts.ipHash,
      keyLimit: opts.keyLimit,
      ipLimit: opts.ipLimit,
      windowMs: opts.windowMs,
    }),
  })
  return (await res.json()) as RateVerdict
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run test/server/utils/tracking/rate-limit.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add server/utils/tracking/rate-limit.ts test/server/utils/tracking/rate-limit.test.ts
git commit -m "feat(tracking): rateCheck helper for the RateLimiter DO"
```

---

### Task 6: Wire both gates into `track.post.ts`

**Files:**
- Modify: `server/api/public/track.post.ts`

> Verified by the shadow-mode curl in Task 11 (the handler is a Nitro route, not unit-tested; all branching logic lives in the pure helpers tested in Tasks 2/3/5).

- [ ] **Step 1: Update imports**

Change the `site-config` import to add `shouldBlockOrigin`, and add the `rate-limit` import:
```ts
import { resolveSiteByWriteKey, isOriginAllowed, shouldBlockOrigin } from '~~/server/utils/tracking/site-config'
import { rateCheck } from '~~/server/utils/tracking/rate-limit'
```

- [ ] **Step 2: Replace the soft origin check (current step 5)**

Find:
```ts
    // 5. Soft origin check — log mismatch, do not block (Slice 1).
    const originOk = isOriginAllowed(site, reqOrigin)
    if (!originOk) console.warn('[track] origin not in allowlist', { site: site.id, reqOrigin })
```
Replace with:
```ts
    // 5. Origin gate. Empty allowlist ⇒ allow-all. Per-site enforce_origin promotes a
    //    mismatch to a hard 403; TRACKING_ORIGIN_MODE=soft is a global kill switch.
    if (!isOriginAllowed(site, reqOrigin)) {
      console.warn('[track] origin mismatch', { site: site.id, reqOrigin })
      if (shouldBlockOrigin(site, reqOrigin, process.env.TRACKING_ORIGIN_MODE)) {
        setResponseStatus(event, 403)
        return { ok: false }
      }
    }
```

- [ ] **Step 3: Insert the rate-limit block (after the `ctx` object is built, before the `// 7. Build + insert rows` comment)**

Insert immediately before `// 7. Build + insert rows (dedup on (site_id, event_id)).`:
```ts
    // 6b. Layered rate limit (per-key ceiling + per-IP burst) via the RateLimiter DO.
    //     Fail-open: a limiter outage/absence must never drop real analytics.
    const rlMode = process.env.TRACKING_RATE_LIMIT_MODE || 'shadow'
    if (rlMode !== 'off') {
      const limiter = (event.context as any).cloudflare?.env?.RATE_LIMITER
      if (limiter) {
        try {
          const verdict = await rateCheck(limiter, {
            writeKey,
            ipHash: ctx.ipHash,
            keyLimit: Number(process.env.TRACKING_RATE_LIMIT_KEY_LIMIT) || 600,
            ipLimit: Number(process.env.TRACKING_RATE_LIMIT_IP_LIMIT) || 60,
            windowMs: Number(process.env.TRACKING_RATE_LIMIT_WINDOW_MS) || 10_000,
          })
          if (!verdict.allowed) {
            console.warn('[track] rate limit', { site: site.id, layer: verdict.layer, mode: rlMode })
            if (rlMode === 'enforce') {
              setResponseHeader(event, 'Retry-After', String(verdict.retryAfterSec ?? 10))
              setResponseStatus(event, 429)
              return { ok: false }
            }
            // shadow: logged the would-block, fall through and allow.
          }
        } catch (err) {
          console.error('[track] rate limiter unavailable — failing open:', err)
        }
      }
      // No binding (dev/local) ⇒ no-op, allow.
    }
```

- [ ] **Step 4: Verify it compiles**

Run: `pnpm exec vitest run test/server/utils/tracking/` (sanity — imports resolve; tracking suite still green)
Expected: PASS. Full typecheck happens in Task 10.

- [ ] **Step 5: Commit**

```bash
git add server/api/public/track.post.ts
git commit -m "feat(tracking): enforce origin gate + layered rate limit in beacon"
```

---

### Task 7: Bind `RATE_LIMITER` into the Pages `wrangler.toml`

**Files:**
- Modify: `wrangler.toml`

- [ ] **Step 1: Add the binding after the `OFFICE_ROOMS` block**

After:
```toml
[[durable_objects.bindings]]
name = "OFFICE_ROOMS"
class_name = "OfficeRoom"
script_name = "office-room-worker"
```
Add:
```toml
# Rate Limiter — Durable Object for the public tracking beacon (hosted in rate-limiter-worker)
[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiter"
script_name = "rate-limiter-worker"
```

> **Deploy ordering (enforced in Task 11):** `rate-limiter-worker` MUST be deployed before the next Pages deploy — Pages will fail binding to a non-existent script otherwise.

- [ ] **Step 2: Commit**

```bash
git add wrangler.toml
git commit -m "chore(tracking): bind RATE_LIMITER DO into Pages project"
```

---

### Task 8: `enforce_origin` toggle on create (endpoint + slideover)

**Files:**
- Modify: `server/api/agency/tracking/index.post.ts`
- Modify: `app/components/tracking/SiteCreateSlideover.vue`

- [ ] **Step 1: Accept `enforceOrigin` in the create endpoint**

In `server/api/agency/tracking/index.post.ts`, add to the `Body` interface (after `retentionDays?`):
```ts
  retentionDays?: number
  enforceOrigin?: boolean
```
Update the INSERT to include the column and value:
```ts
    `INSERT INTO tracking_sites (client_id, name, write_key, allowed_origins, spa, consent_mode, lead_selectors, retention_days, enforce_origin)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      body.clientId, body.name.trim(), generateWriteKey(),
      body.allowedOrigins ?? [], body.spa ?? false, body.consentMode ?? 'off',
      body.leadSelectors ?? [], body.retentionDays ?? 395, body.enforceOrigin ?? false,
    ]
```

- [ ] **Step 2: Add the toggle to `SiteCreateSlideover.vue`**

2a. Add to the `form` reactive (after `retentionDays: 395`):
```ts
  retentionDays: 395,
  enforceOrigin: false
```
2b. Add to `reset()` (after `form.retentionDays = 395`):
```ts
  form.retentionDays = 395
  form.enforceOrigin = false
```
2c. Add `enforceOrigin` to the `$fetch` POST body (after `retentionDays: ...`):
```ts
        retentionDays: Number(form.retentionDays) || 395,
        enforceOrigin: form.enforceOrigin
```
2d. Add the UI field in the template, immediately after the SPA `UFormField` (the last field in the `#body` `space-y-4` block):
```vue
        <UFormField
          label="Enforce allowed origins"
          help="Hard-block (403) beacons from origins not in the list. No effect until origins are set above."
        >
          <USwitch v-model="form.enforceOrigin" label="Reject unlisted origins" />
        </UFormField>
```

- [ ] **Step 3: Verify the component builds (lint/parse)**

Run: `pnpm exec vitest run test/server/utils/tracking/` (backend sanity green)
Expected: PASS. (Vue SFC is validated by the full build in Task 10; no unit test for the slideover.)

- [ ] **Step 4: Commit**

```bash
git add server/api/agency/tracking/index.post.ts app/components/tracking/SiteCreateSlideover.vue
git commit -m "feat(tracking): enforce_origin toggle on site creation"
```

---

### Task 9: Allow `enforce_origin` via the patch endpoint (future edit UI)

**Files:**
- Modify: `server/api/agency/tracking/[id].patch.ts`

- [ ] **Step 1: Add `'enforce_origin'` to the `allowed` array**

Change:
```ts
  const allowed = ['name', 'allowed_origins', 'spa', 'consent_mode', 'lead_selectors', 'retention_days', 'is_active']
```
to:
```ts
  const allowed = ['name', 'allowed_origins', 'enforce_origin', 'spa', 'consent_mode', 'lead_selectors', 'retention_days', 'is_active']
```

- [ ] **Step 2: Commit**

```bash
git add 'server/api/agency/tracking/[id].patch.ts'
git commit -m "feat(tracking): allow enforce_origin via site patch endpoint"
```

---

### Task 10: Full verification — tests + typecheck

**Files:** none (verification only)

- [ ] **Step 1: Run the full tracking + new test suites**

Run: `pnpm exec vitest run test/server/utils/tracking/ test/workers/rate-limiter/`
Expected: PASS — all existing tracking tests plus the new `shouldBlockOrigin`, `rateCheck`, and sliding-window/LRU tests.

- [ ] **Step 2: Run the whole unit suite (catch regressions)**

Run: `pnpm exec vitest run`
Expected: PASS (same green baseline as before this branch).

- [ ] **Step 3: Typecheck (large heap — a silent OOM yields a false pass)**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck`
Expected: no NEW errors beyond the ~60 pre-existing `index.d.ts` errors. Confirm none reference the files changed in this branch.

- [ ] **Step 4: Commit (if typecheck surfaced fixable issues; otherwise skip)**

```bash
git add -A && git commit -m "fix(tracking): resolve typecheck issues from hardening slice"
```

---

### Task 11: Deployment runbook — shadow → enforce (OPERATIONAL — run on user go-ahead)

**Files:** none (deployment + observation)

> This task deploys to production infrastructure. Run it only with explicit user approval. Shipping in `shadow` mode means **no behaviour change** to live beacons on first deploy — it only starts logging would-block events.

- [ ] **Step 1: Deploy `rate-limiter-worker` FIRST (so the DO class exists)**

Run:
```bash
cd workers/rate-limiter && pnpm install && pnpm exec wrangler deploy; cd ../..
```
Expected: `Deployed rate-limiter-worker` with the `RateLimiter` durable object migration `v1` applied.

- [ ] **Step 2: Set Pages env vars (production) before the Pages deploy**

In Cloudflare → Pages → `agency-dashboard` → Settings → Variables (Production):
- `TRACKING_RATE_LIMIT_MODE` = `shadow`
- (optional) `TRACKING_RATE_LIMIT_KEY_LIMIT` = `600`, `TRACKING_RATE_LIMIT_IP_LIMIT` = `60`, `TRACKING_RATE_LIMIT_WINDOW_MS` = `10000`
- Leave `TRACKING_ORIGIN_MODE` unset (per-site flags govern; all sites default `enforce_origin=false`).

- [ ] **Step 3: Deploy Pages**

Run: `pnpm deploy:production`
Expected: `Deployment complete` (the `RATE_LIMITER` binding now resolves to the deployed worker).

- [ ] **Step 4: Smoke-test the beacon still 200s and the DO is reachable**

Run:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://agency-dashboard-6cm.pages.dev/api/public/track?k=<a-real-write-key>" \
  -H 'content-type: application/json' -H 'origin: https://<a-real-dealer-origin>' \
  --data '{"events":[{"name":"page_view"}]}'
```
Expected: `200`. In shadow mode nothing is blocked; check Pages logs for `[track] rate limit` / `[track] origin mismatch` lines reflecting real traffic.

- [ ] **Step 5: Observe (days), then enforce**

1. Watch shadow logs for false positives on real dealer traffic; tune limits if needed.
2. Populate `allowed_origins` per dealer; confirm `[track] origin mismatch` logs are clean for that site.
3. Flip origin enforcement per dealer (SQL — no edit UI yet):
   ```bash
   psql "$DATABASE_URL" -c "UPDATE tracking_sites SET enforce_origin = TRUE WHERE id = '<site-id>'"
   ```
   (Takes effect within the 5-min write-key cache TTL.)
4. Once would-block logs show only genuine abuse, set Pages env `TRACKING_RATE_LIMIT_MODE=enforce` and redeploy (or re-save env + retrigger).

- [ ] **Step 6: Rollback (if needed)**

- Rate limiting: set `TRACKING_RATE_LIMIT_MODE=off` (or `shadow`) — env-only, instant.
- Origin gate: set `TRACKING_ORIGIN_MODE=soft` (global) or `UPDATE tracking_sites SET enforce_origin=FALSE` per site.
- The `rate-limiter-worker` can remain deployed (idle) — no teardown needed.

---

## Self-Review (completed by author)

- **Spec coverage:** §3 DO → Tasks 3-4; §4a origin gate → Tasks 2, 6; §4b rate limit → Tasks 5, 6; §4 config env → Task 6 + Task 11; §5 schema/migration → Task 1; §5 toggle → Tasks 8-9 (scoped to create + SQL for existing, per the create-only reality); §6 rollout → Task 11; §7 testing → Tasks 2/3/5 + Task 10; binding → Task 7. No spec requirement left unmapped.
- **Placeholder scan:** every code step contains full code; the only `<placeholders>` are deploy-time values in Task 11 (real write key / dealer origin / site id), which are inherently runtime inputs.
- **Type consistency:** `WindowState`, `newWindow`, `checkAndCount`, `LruMap` (Task 3) are used identically in Task 4; `RateVerdict`/`RateLimiterNamespace`/`rateCheck` (Task 5) match the call site in Task 6; `shouldBlockOrigin` signature (Task 2) matches its call in Task 6; `enforceOrigin` (camel) on the type vs `enforce_origin` (snake) in SQL/JSON is consistent with the codebase's `mapRow` convention.
