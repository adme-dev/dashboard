# Tracking Hardening — Hard Origin Gate + Layered Rate Limiting

**Date:** 2026-05-31
**Status:** Design approved, pending spec review
**Branch:** `feat/tracking-hardening` (off `origin/main` @ `789220d`)
**Surface:** the public, unauthenticated tracking beacon `POST /api/public/track`

---

## 1. Background & Motivation

The first-party tracking beacon (`server/api/public/track.post.ts`, shipped in Slices 1–2)
is gated only by a **public write key** and a **soft** Origin check (logs a mismatch, never
blocks). It has **no rate limiting**. Because the write key is embedded in every dealer's
public snippet, "has a valid key" bounds nothing: anyone who views source can replay it.

This slice closes the two deferred hardening items from the tracking handoff
(`docs/superpowers/handoffs/2026-05-31-tracking-handoff.md`):

1. **Promote the soft Origin check to a real (per-site) hard 403.**
2. **Add layered, globally-accurate rate limiting** (per-write_key ceiling + per-IP burst).

### Threat model (priority order)

1. **Data integrity (primary).** The product's value is clean dealer analytics — pageviews,
   funnels, attribution, lead counts, and any AI summaries built on them. A looping SPA, a
   scraper, or a bot replaying the public write key can silently **inflate** a dealer's
   numbers. Unbounded ingestion is a data-quality risk before it is ever a cost risk. The
   rate limiter must therefore **fail in the direction of accuracy** — its dangerous failure
   mode is *letting floods through* and under-counting.
2. **Cost / DB load.** Every junk event is a Neon write; a flood is spend + query contention.
3. **Security / blast radius.** The write key is public by design, so the rate limiter *is*
   the real perimeter on this endpoint.

### Why a Durable Object (the locked decision)

Globally-accurate atomic counting is required by the integrity goal. On this Cloudflare
Pages + Nitro stack:

- **KV (`CACHE`)** — eventually consistent, no atomic increment. Undercounts under concurrency
  → fails *open* under exactly the flood we must catch. **Rejected.**
- **CF-native Rate Limiting binding** — counts **per-colo**, not globally. A distributed flood
  gets `limit × number-of-datacenters`. Breaks the per-key ceiling's accuracy. **Rejected.**
- **Durable Object** — single-threaded per instance → exact atomic counts, strongly consistent.
  **Chosen.** Cost: one new standalone worker (Pages cannot host a DO class inline; all existing
  DOs — `CHAT_ROOMS`, `BOARD_ROOMS`, `BANNER_ROOMS`, `office-room-worker` — are external workers
  bound via `script_name`), plus ~one DO RPC per beacon (cheap).

---

## 2. Architecture Overview

```
browser beacon ──POST /api/public/track?k=<writeKey>──▶ Pages Function (track.post.ts)
                                                          │
                                  1. resolve site by write key (existing)
                                  2. ORIGIN GATE (new): per-site enforce → 403
                                  3. RATE LIMIT (new): RPC to RateLimiter DO ──▶ rate-limiter-worker
                                                          │                          (DO: one instance
                                  4. on deny → 429        │                           per write_key)
                                  5. else insert rows (existing)
```

Two cooperating units, each independently testable:

- **`rate-limiter-worker/`** — new standalone Worker exporting the `RateLimiter` Durable Object.
  Pure counting logic; knows nothing about tracking semantics. Bound into the Pages project as
  `RATE_LIMITER` via `[[durable_objects.bindings]]` + `script_name = "rate-limiter-worker"`,
  mirroring the existing DO workers.
- **`track.post.ts` + `site-config.ts`** — call the limiter and enforce the origin gate. Both
  new gates **fail open** and degrade gracefully (no binding in dev → no-op).

---

## 3. Component: `RateLimiter` Durable Object

**Identity:** one DO instance per write key — `env.RATE_LIMITER.idFromName(writeKey)`. A key's
state (its ceiling counter + its per-IP buckets) is fully contained in that one instance, so
counting is naturally sharded by tenant and globally consistent for that tenant.

**State (in-memory; no `storage` persistence needed):**
- `keyCounter` — a sliding-window counter for the per-key ceiling.
- `ipBuckets: Map<ipHash, slidingWindowCounter>` — bounded LRU, cap **5,000** entries; on insert
  over cap, evict the least-recently-used. Bounds DO memory regardless of attacker IP spread.

> DO eviction (idle reclaim) resets in-memory counters. This is an acceptable, brief fail-open
> window — it cannot under-protect a *sustained* flood (which keeps the DO warm) and never drops
> real data. No `storage` writes (they would add latency + cost to the hot path for no integrity gain).

**Sliding-window-counter algorithm** (per counter, the standard weighted approximation):

```
state = { windowStart, currCount, prevCount }
on request at now, given limit, windowMs:
  elapsed = now - windowStart
  if elapsed >= 2*windowMs:  prevCount=0; currCount=0; windowStart=now
  elif elapsed >= windowMs:  prevCount=currCount; currCount=0; windowStart += windowMs; elapsed -= windowMs
  estimated = currCount + prevCount * (1 - elapsed/windowMs)
  if estimated + 1 > limit:  return { allowed:false, retryAfterSec: ceil((windowMs - elapsed)/1000) }
  currCount += 1
  return { allowed:true }
```

**Interface (the Pages side owns config; the DO is a pure counter):**

```
POST (internal fetch) /check
  body: { ipHash: string, keyLimit: number, ipLimit: number, windowMs: number }
  → 200 { allowed: true }
  → 200 { allowed: false, layer: 'key' | 'ip', retryAfterSec: number }
```

Check order: **key ceiling first**, then per-IP. Both counters increment only when the request
is allowed by *that* layer (a request denied at the key layer does not consume IP budget).

The pure window + LRU functions are extracted into a plain module so they are unit-testable
without instantiating a DO.

---

## 4. Component: Pages-side integration (`track.post.ts`)

Inserted **after** write-key resolution (existing step 3) and **before** the DB insert (existing
step 7), in this order: origin gate, then rate limit.

### 4a. Origin gate (promote soft → hard, per-site)

- `site-config.ts`: add `enforceOrigin: boolean` to `TrackingSite` + `mapRow` (reads new column).
- Handler logic:
  ```
  originOk = isOriginAllowed(site, reqOrigin)          // unchanged: empty allowlist ⇒ allow-all
  if (!originOk) {
    console.warn('[track] origin mismatch', { site: site.id, reqOrigin })   // always log
    if (site.enforceOrigin && !originGloballyDisabled()) {
      setResponseStatus(event, 403); return { ok: false }
    }
  }
  ```
- **Empty `allowed_origins` always means allow-all**, so turning on `enforce_origin` for a site
  that has not populated its allowlist is a safe no-op (cannot break un-configured dealers).
- **Global emergency override:** env `TRACKING_ORIGIN_MODE=soft` forces soft everywhere (instant
  kill without DB edits). Unset/any-other value ⇒ honor per-site flags.

### 4b. Rate limit

```
mode = process.env.TRACKING_RATE_LIMIT_MODE || 'shadow'   // off | shadow | enforce
if (mode !== 'off') {
  const limiter = (event.context as any).cloudflare?.env?.RATE_LIMITER
  if (limiter) {
    try {
      const verdict = await rateCheck(limiter, { ipHash: ctx.ipHash, keyLimit, ipLimit, windowMs })
      if (!verdict.allowed) {
        console.warn('[track] rate limit', { site: site.id, layer: verdict.layer, mode })
        if (mode === 'enforce') {
          setResponseHeader(event, 'Retry-After', String(verdict.retryAfterSec))
          setResponseStatus(event, 429); return { ok: false }
        }
        // shadow: logged, fall through and allow
      }
    } catch (err) {
      console.error('[track] rate limiter unavailable — failing open:', err)   // FAIL OPEN
    }
  }
  // no binding (dev/local) ⇒ no-op, allow
}
```

- **Fail-open is mandatory.** A limiter outage must never nuke all ingestion — the integrity
  cost of dropping real data exceeds the cost of an unbounded window during an outage.
- **`ipHash` is the salted hash already computed** for the insert (`sha256(ip + ':' + salt)`),
  reused — we never send a raw IP to the DO.
- 429 is a 4xx, not a 5xx — it is the correct shed-load signal and consistent with the endpoint's
  "never surface a 5xx to the page" contract. The denied event is simply not inserted.

### Config (env, read on the Pages side)

| Var | Default | Meaning |
|---|---|---|
| `TRACKING_RATE_LIMIT_MODE` | `shadow` | `off` \| `shadow` \| `enforce` |
| `TRACKING_RATE_LIMIT_KEY_LIMIT` | `600` | events per window, per write_key |
| `TRACKING_RATE_LIMIT_IP_LIMIT` | `60` | events per window, per ip_hash |
| `TRACKING_RATE_LIMIT_WINDOW_MS` | `10000` | sliding window size (ms) |
| `TRACKING_ORIGIN_MODE` | _(unset)_ | `soft` = global emergency override; else per-site |

Defaults rationale: a real visitor fires `page_view` + a handful of interaction events per load;
**60 events / 10 s** per IP (≈6/s) is generous yet trips instantly on a hundreds-per-second flood.
**600 / 10 s** per key (≈3.6k/min) bounds a single dealer's total ingestion. Per-site limit
overrides are **deferred** (YAGNI for this slice) — high-volume dealers get a raised global limit
or a future per-site column.

---

## 5. Schema — migration 139

```sql
-- 139-tracking-enforce-origin.sql
ALTER TABLE tracking_sites
  ADD COLUMN IF NOT EXISTS enforce_origin BOOLEAN NOT NULL DEFAULT FALSE;
```

Additive, `IF NOT EXISTS`-guarded, default `FALSE` (every existing site stays in soft mode).
Number **139** clears all known in-flight migrations (CRM 134/135/138, email 136/137 per project
memory); **re-verify at merge time** and renumber if a collision appears, matching how the email
and CRM branches resolved their own collisions.

An admin toggle for `enforce_origin` is added to the existing tracking-site settings surface:
- `server/api/agency/tracking/[id].patch.ts` — add `'enforce_origin'` to its `allowed` column
  array (the handler already snake-cases incoming keys and `invalidateSiteCache`es on write, so a
  toggle takes effect immediately).
- `app/components/tracking/SiteCreateSlideover.vue` — the **create-only** slideover (no per-site
  edit UI calls PATCH today); add a `USwitch` bound to `enforce_origin` (helper text noting it is a
  no-op until `allowed_origins` is populated) so new sites can be created enforcing. **Existing**
  sites are flipped via SQL during rollout (§6), same operational path as populating allowlists.

---

## 6. Rollout sequence (shadow → enforce, no flag-day)

1. **Deploy `rate-limiter-worker` first** (so the DO class exists before Pages references the
   binding — otherwise the Pages deploy fails binding to a non-existent script).
2. Add the `RATE_LIMITER` binding to the Pages `wrangler.toml`; deploy Pages with
   `TRACKING_RATE_LIMIT_MODE=shadow` and all sites `enforce_origin=false`.
3. **Observe** (`shadow`): watch logs for `[track] rate limit` (would-block) and `[track] origin
   mismatch` against real dealer traffic. Tune limits if real traffic trips them.
4. Populate `allowed_origins` per dealer; confirm shadow origin-mismatch logs are clean for that site.
5. **Flip `enforce_origin=true` per dealer** (granular; one dealer at a time).
6. **Flip `TRACKING_RATE_LIMIT_MODE=enforce`** once would-block logs show only genuine abuse.

**Rollback:** set `TRACKING_RATE_LIMIT_MODE=off` (or `shadow`) and/or `TRACKING_ORIGIN_MODE=soft`
— instant, env-only, no redeploy of the worker, no DB edits. The DO worker can stay deployed (idle).

**Operator notes (surfaced in code review):**
- **Origin matching is byte-exact.** `allowed_origins` entries must match the browser `Origin`
  header exactly — scheme + host + port, no trailing slash (`https://www.dealer.com`, not
  `https://www.dealer.com/` or `http://…`). `www` vs apex and `:443` are distinct strings. Verify
  against real `[track] origin mismatch` shadow logs before flipping `enforce_origin` for a site.
- **The per-IP layer is best-effort above 5,000 distinct IPs per site.** Each write_key's DO caps
  its `ip_hash` LRU at 5,000 entries; a flood churning more distinct IPs than that against one site
  evicts its own buckets and can reset its per-IP counter. The **per-key ceiling is the hard
  backstop** (a single shared window, never evicted), so the global cap holds regardless — but do
  not over-trust the per-IP burst guarantee under a high-cardinality distributed attack.

---

## 7. Testing

- **`rate-limiter-worker` window/LRU unit tests** (pure functions, no DO instance): window roll at
  1× and 2× windowMs, weighted estimate near boundaries, deny at limit, allow after window passes,
  LRU eviction at the 5,000 cap, key-deny does not consume IP budget.
- **`site-config` origin tests:** `enforce_origin=true` + non-empty allowlist + bad origin ⇒ block
  decision; empty allowlist ⇒ allow even when enforcing; `TRACKING_ORIGIN_MODE=soft` override.
- **`track.post` paths:** new **429** (limiter denies in `enforce`), **shadow allows** (denies but
  mode=shadow), **fail-open** (limiter throws ⇒ allow), **403** (origin enforced). Existing
  200 / 403-bad-key / 422 / 413 / UUID-400 cases stay green.

---

## 8. Out of scope (deferred)

- Per-site rate-limit override columns + tuning UI.
- Adaptive / anomaly-aware limits (auto-throttle a key spiking vs its own baseline).
- WAF edge offload of the per-IP layer (option C) — revisit when volume justifies shaving the
  per-IP check off Worker compute.
- Per-isolate pre-filter cache to skip the DO for obviously-under-limit keys (cost optimization).

---

## 9. File manifest

| File | Change |
|---|---|
| `rate-limiter-worker/wrangler.toml` | new — worker config + DO migration (`new_classes = ["RateLimiter"]`) |
| `rate-limiter-worker/index.ts` | new — `RateLimiter` DO class + `/check` handler |
| `rate-limiter-worker/sliding-window.ts` | new — pure window + LRU logic (unit-tested) |
| `server/utils/tracking/rate-limit.ts` | new — `rateCheck(limiter, opts)` Pages-side helper |
| `server/utils/tracking/site-config.ts` | edit — add `enforceOrigin` to type + `mapRow` + SELECT |
| `server/api/public/track.post.ts` | edit — origin gate (4a) + rate limit (4b) |
| `server/api/agency/tracking/[id].patch.ts` | edit — add `'enforce_origin'` to `allowed` array |
| `app/components/tracking/SiteCreateSlideover.vue` | edit — `enforce_origin` `USwitch` |
| `server/database/migrations/139-tracking-enforce-origin.sql` | new |
| `wrangler.toml` | edit — add `RATE_LIMITER` `[[durable_objects.bindings]]` |
| test files (3, per §7) | new/edit |
