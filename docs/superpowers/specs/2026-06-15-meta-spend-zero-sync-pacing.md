# Meta Spend Sync Returns $0 — Diagnosis & Pacing Fix (design)

**Date:** 2026-06-15
**Status:** Design / next task (not yet implemented)
**Related:** [[agency-jobs-queue-consumer]], the Google queue fan-out fix (shipped this session — Google works because it has independent per-account tokens; Meta does not).

## Problem

The automated daily Meta ad-spend sync completes the job but writes **$0** — `synced_count=0`, no `media_spend` rows refreshed. The only thing that has ever refreshed Meta data is a **manual local run of the bulk `syncMetaSpend(month, year)`** (wrote 87 campaigns / ~$29.8k). The per-account queue path silently writes nothing.

## Evidence (this session)

1. **Token sharing is the structural difference vs Google:**
   | Platform | Connections | Distinct access tokens |
   |---|---|---|
   | Google | 102 | 102 (one per account) |
   | Meta | 113 | **1** (all share one app token) |
   Google's per-account queue fan-out works because each account has its own token (independent rate budget). Meta's 113 accounts share **one** token, so any fan-out concentrates load on a single rate limit.

2. **Both sync functions call the identical `syncMetaSpendAccount`** — `syncMetaSpend` (bulk loop) and `syncMetaSpendByConnectionId` (per-account) differ only in how many connections they load. So the $0 is **not** a code difference between them, and **not** the Graph API version (both use `v22.0`; the bulk path on `v22.0` works).

3. **⚠️ Sequential-from-prod STILL returns $0 (the key, under-appreciated finding):** a manual drain that POSTed all 113 `spend.sync.meta.account` messages to `/api/internal/process-job` **strictly one-at-a-time (blocking)** — stricter than the consumer's `max_concurrency=2` — still produced `synced_count=0` across all 113. So **lowering consumer concurrency to 1 will NOT fix it.** The discriminator between the working bulk-local run and the failing per-account-prod run is *not* concurrency.

4. **Meta signals the rate limit as `200 + empty `data:[]``, not `429`.** `metaFetch` only retries on `429`/`500` (`metaClient.ts:312`), so the empty-data throttle is invisible — the sync treats "rate-limited empty" as "no spend" and writes nothing.

## What is NOT the cause (ruled out)

- **No Meta SDK upgrade applies** — the app calls Graph directly via `ofetch`; there is no `facebook-nodejs-business-sdk` to bump. (Bumping `v22.0`→`v23` is reasonable hygiene but the bulk path proves `v22` works, so it won't fix $0.)
- **Concurrency** — sequential-from-prod already fails (Evidence 3).
- **Token validity** — the shared token reads June campaign data fine from the bulk path the same day.

## Leading hypotheses (to confirm in Phase 1)

The remaining difference between working (bulk, local) and failing (per-account, prod) is **execution context**: many short-lived Cloudflare Pages requests from CF egress IPs vs one long-lived local process from a residential IP. Candidates:
- **A. App-usage rate limit on the shared token** is already near/at 100% by the time the per-account run starts (the bulk local run may have hit it at a different point in the daily budget), and Meta returns 200+empty once the per-app hourly budget is exhausted. Meta exposes this in the **`x-app-usage`** / **`x-business-use-case-usage`** response headers — which we currently neither read nor log.
- **B. CF-egress treatment** — Meta rate-limits or soft-blocks Cloudflare egress IP ranges more aggressively than a residential IP, returning empty data.
- **C. Per-request cold-start pacing** — each Pages request re-imports/re-inits, subtly changing call timing vs the tight bulk loop (least likely given Evidence 3 spacing).

We must **measure before fixing** — Evidence 3 means a blind "add pacing" could ship and still write $0.

## Plan

### Phase 1 — Instrument & diagnose (no behavior change)
1. In `metaFetch` (`server/utils/metaClient.ts`), capture and log the response headers **`x-app-usage`**, **`x-business-use-case-usage`**, **`x-ad-account-usage`** on each insights call (ofetch exposes `response.headers` via the `onResponse` hook or `ofetch.raw`). Log at warn level when any usage metric > 80%.
2. Add a **"suspicious empty" signal**: when an account that has `media_spend` rows from a prior period/sync returns `data:[]`, log it distinctly (likely rate-limited, not genuinely zero-spend).
3. Deploy, then trigger ONE prod per-account Meta sync (POST a single `spend.sync.meta.account` to `/api/internal/process-job`) and read the logged headers via `wrangler pages deployment tail` / the worker logs.
   - **If `x-app-usage` ≈ 100%** → hypothesis A confirmed (rate budget exhausted): fix = real pacing + backoff that respects the budget (Phase 2A).
   - **If usage is low but `data:[]`** → hypothesis B/empty-throttle: fix = detect-empty-and-retry-with-backoff and/or a non-CF egress path (Phase 2B).

### Phase 2A — Budget-aware pacing (if app-usage is the cause)
- Make `syncMetaSpendAccount` (or `metaFetch`) **read `x-app-usage` and sleep/back off** when the percentage crosses a threshold (e.g. wait when >90%, exponential up to the hourly reset). Because all 113 share one token, pacing must be **serialized** — process Meta through a single ordered stream, not parallel messages.
- Durable + paced shape: keep Meta on the queue but as **chunked messages** (e.g. ~10 accounts/message, each chunk processed sequentially in-message with a per-call delay, fitting the Pages function time budget) **with a serialization guarantee** so only one Meta chunk is in flight (dedicated low-throughput consumer or a KV/DO lock). This avoids both the single-`waitUntil` timeout (the Google bug) and the shared-token contention.

### Phase 2B — Detect-empty-and-retry (if empty-throttle without usage signal)
- Treat `data:[]` for an account with known prior spend as a soft failure → exponential backoff retry (a few attempts) inside `syncMetaSpendAccount`; record a real `failure` (not silent $0) if still empty after retries, so the job surfaces it instead of completing "successfully" with $0.
- If CF-egress is implicated, consider routing the Meta sync through a path with different egress (e.g. a scheduled run that isn't CF-Pages, or Hyperdrive/region pinning) — to be scoped only if Phase 1 points here.

### Phase 3 — Verify
- Re-run the prod per-account drain; confirm `synced_count` and `media_spend.synced_at` reflect fresh data (target ≈ the ~$30k / 87 campaigns the bulk path produces), with the job completing without silent $0.
- Add a guard: the daily sync should **alert/log** if a Meta job completes with `synced_count=0` while connections exist (never again silently write $0).

## Non-goals
- Migrating off the single shared Meta token (per-account Meta tokens would dissolve the constraint, but that's an OAuth/onboarding change out of scope here).
- The jobs-consumer `CRON_SECRET` restoration (separate operational item; tracked in [[agency-jobs-queue-consumer]]).

## Open question for the operator
Is the single shared Meta token intentional (one Business/system-user token across all 113 client ad accounts), or should each client connection carry its own token? The answer determines whether Phase 2A pacing is a permanent design or a stopgap until per-account tokens.
