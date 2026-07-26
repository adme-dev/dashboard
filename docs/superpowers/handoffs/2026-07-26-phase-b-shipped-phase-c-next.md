# Handoff — Phase B shipped, Persona 360 findings triaged, Phase C next

Date: 2026-07-26. Session ran long (context exhausted at ~68%); continue in a fresh session.

## Where things stand right now

`origin/main` HEAD: `e7eed6e8` ("feat(tracking): Phase B funnel & intent signals", PR #306, merged). This session started from the handoff at `docs/superpowers/handoffs/2026-07-26-persona-360-tracking-fixes-and-roadmap.md` (now stale/superseded — that work is done).

### 1. Re-dispatched Persona 360 reviews — all 6 completed, findings triaged, partially fixed

The prior session's 9 review dimensions (only 3 completed then) were re-run fresh against current `main`. All 6 previously-outstanding dimensions (RBAC/tenant isolation, export authorization, billing entitlements, migration safety, queue retries, test coverage) now have full reports — 63 findings total across all 6, severity-ranked in each report (full text is in this session's transcript, not repeated here — re-run the reviews again if the transcript isn't available, don't trust a stale summary).

**User explicitly scoped the fix to "live bug + PII-removal pattern only"** — deferring the rest. What got fixed and shipped in **PR #305** (merged, migration 309 run against prod):
- **Live bug**: migration `283` was a stale recovery-commit resurrection of an already-superseded file (`288`), silently reverted the widened `agency_clients.lead_capture_mode` CHECK constraint. Fixed via forward-fix migration `309_fix_lead_capture_mode_constraint_regression.sql` (same pattern as `307` fixing `298`). **Verified live in prod** — constraint now accepts all 5 modes.
- **PII-removal pattern** (3 review dimensions converged on this): kill switches/emergency-stop/terms-acceptance/cancelled-request status were blocking the ability to *remove* PII from Google/Meta audiences once consent was withdrawn — the compliance-safe direction was the one getting blocked. Fixed in `server/utils/persona/audienceSync.ts`: removal now bypasses those gates (matches migration 297's own DB-layer intent, "always permitting removal exports"); k-anonymity floor now only blocks new additions, never removals; a cancelled activation request can still be torn down; an in-flight sync aborts if cancelled mid-run; Meta-confirmed membership is now recorded before the bookkeeping write that was found to be the actual failure point (orphaned-member bug).

**Explicitly NOT fixed, still open** (documented in PR #305's description, not yet re-triaged since):
- Billing: usage metering fully specced but zero callers anywhere (nothing is actually metered/capped); a `project_manager` role can grant paid entitlements above the client's plan tier; suspending a client's billing doesn't stop persona-identity ingestion in several code paths (divergent entitlement resolvers — `isPersonaIdentityEnabled` vs `resolveClientEntitlement` vs `crmAccessPolicy` read different tables).
- RBAC: migration 304 gave every portal user (including `viewer` role) CRM write access, not just intended roles; portal users can release their own privacy/legal-hold consent suppressions.
- Queues: Google multi-batch request-ID loss on partial failure (orphaned/duplicate paid re-ingest risk); queue-retry-as-poller abandons long-running Google exports in `submitted` status forever (no reconciliation cron); authorization-withdrawal trigger cascade loses the failure reason.
- Tests: `test/config/personaConsentSuppressionMigrationContract.test.ts` still pins the pre-307 buggy consent predicate as its expected contract — a landmine for anyone touching migration 298 later. Zero test coverage on `audienceSync.ts`/`activation.ts` generally.
- Migrations: duplicate numbering (`258`×2, `266`×3, `283`×2 — the `283`/`288` pair was the live bug just fixed; the others are confirmed harmless byte-identical duplicates, not double-apply risks).

**None of this is urgent** — it was the user's own explicit choice to defer it once already. Worth a second pass eventually, but don't assume it's forgotten-about-by-accident; it was deliberate.

### 2. Phase B shipped — PR #306, merged

Six new client-side tracking signals added to `public/track.js`, building on Phase A (already live, verified this session — `vehicle_view` firing correctly for South Morang with real dealer traffic):

1. Return-to-vehicle detection
2. Cross-shop / comparison-set tracking (`vehicle_comparison`)
3. VDP dwell time (vehicle context merged into existing `engagement` event)
4. Exit-intent detection
5. Wishlist/save click detection (`add_to_wishlist`)
6. CTA/price visibility via IntersectionObserver

All six gated by new `data-funnel-signals="false"` flag, independent of existing `data-behavioral`. Design doc: `docs/superpowers/specs/2026-07-26-phase-b-funnel-intent-signals-design.md`. Plan: `docs/superpowers/plans/2026-07-26-phase-b-funnel-intent-signals.md` (8 TDD tasks, executed via subagent-driven-development — fresh implementer per task, task review, fix rounds where needed).

**Two pre-existing, unrelated test-harness bugs found and fixed along the way** in `test/public/track-tag.test.ts` (both caused cross-test pollution, neither related to Phase B's own logic):
- `history.pushState` was never restored between tests → wrapper-stacking across `spa:true` tests → stale closures firing on later tests.
- A cookie-set call missing `path=/` → happy-dom cookie jar kept a stale entry the `beforeEach` clear couldn't match → consent state leaked across tests.

**Final whole-branch review found and fixed 2 Critical issues before merge** (worth knowing about since they were live/latent risks, not just code-quality nits):
- `return_to_vehicle` was missing from `isEventAllowed()`'s analytics-consent bucket — would have leaked vehicle-level browsing data to visitors who explicitly declined analytics consent.
- `cta_visible` had an uncapped fan-out — price selectors (`.price`, `[data-price]`, `.vehicle-price`) matched every card on a listing page, one HTTP POST per element with no cap and no per-site kill switch (30 POSTs per listing-page-view in the reviewer's probe). Fixed by scoping price selectors to vehicle-detail-pages only and adding a hard cap (`CTA_VISIBILITY_MAX_ELEMENTS = 20`).

**Deliberately deferred from Phase B** (documented in PR #306, small well-scoped follow-up work, not urgent):
- `return_to_vehicle`'s "new session" check uses elapsed-time (`> SESSION_MINUTES`) rather than actual session-ID comparison — can false-positive within one long browsing session (a serious car-shopper browsing 40+ minutes straight). Fix needs a storage-shape change (`_xf_vehicle_visits_v1` from `{key: timestamp}` to `{key: {ts, sessionId}}`) plus updating several already-reviewed/passing tests that manipulate the old shape directly — that's why it wasn't bundled into the final-review fix wave (higher blast radius than the other fixes, which were single-purpose one-liners).
- The vehicle-context-merge loop (`for...in`/`hasOwnProperty`) is now duplicated 3× (`trackPageView`, `setupEngagementTracking`, `setupWishlistTracking`) — small `mergeVehicleContext(data, ctx)` helper would be reasonable cleanup.
- New event names (`vehicle_comparison`, `return_to_vehicle`, etc.) aren't yet classified in `server/utils/persona/signalLedger.ts`'s `INTENT_SIGNALS` — that's explicitly Phase C's job (intent-tier scoring), not a gap.

**Not yet verified**: none of the six new event types have been observed firing on real South Morang traffic post-deploy yet (this PR only just merged). First thing to check in the new session if picking up tracking work: query `tracking_events` for South Morang (`site_id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`) for `vehicle_comparison`, `return_to_vehicle`, `exit_intent`, `add_to_wishlist`, `cta_visible`, and `engagement` rows with `event_data->>'vehicle_stock_number'` populated.

## My recommendation for what's next

**Phase C (ad-spend efficiency)** — the natural next roadmap step, and depends on Phase B's signals now being live: intent-tier scoring (combine cross-shop depth + VDP dwell + form-start into hot/warm/cold, export as separate audience tiers — the single highest-leverage item per the user's own framing), exclusion audiences from negative signals (bounce <3s, `competitive_referrer` click — already collected, currently unused for exclusion), conversion value passed to Meta CAPI/Google Enhanced Conversions (**confirmed this session**: both `deliverMetaConversionEvent`/`deliverGoogleDataManagerEvent` in `workers/measurement-delivery/src/providers.ts` are binary-only today, no `value`/`currency` field anywhere — this is a real, confirmed gap, not just a suspicion), and micro-conversions fed to GA4/Google Ads as intermediate conversions.

Start Phase C the same way Phase B started: brainstorming skill first (it's new feature work spanning ~4 items, touching the ad-platform delivery pipeline this time, not just `track.js`) — don't skip straight to a plan.

**Lower priority, your call on timing**: the Phase B deferred cleanup items (small, cheap, could bundle as a quick first task before diving into Phase C), and the still-open Persona 360 findings from section 1 above (real, but the user already explicitly deprioritized them once — don't assume they were forgotten).

## Key facts for the new session

- **This handoff was committed from `/private/tmp/dashboard-podium-provider-identity`**, a separate clean worktree already on `main` — used because the primary checkout at `/Users/paulgiurin/Documents/Projects/dashboard` has unrelated pre-existing uncommitted work on `release/send-scan-foundation`, and `main` is contested across multiple worktrees (a recurring friction this session — `gh pr merge`/`gh pr merge --delete-branch` will fail with "'main' is already used by worktree at ..." even though the merge itself succeeds via the API; just verify with `gh pr view <N> --json state,mergedAt` after).
- **Start a fresh worktree** for Phase C work (`EnterWorktree` tool, or the `using-git-worktrees` skill) — don't reuse this session's now-deleted `persona-360-tracking-continuation` worktree.
- **`.env`/`.env.local` are not auto-symlinked into a fresh `EnterWorktree`-created worktree** — copy them over manually for DB access / dev server to work: `cp /Users/paulgiurin/Documents/Projects/dashboard/.env <worktree>/.env`.
- **DB access**: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)`, then `psql "$DATABASE_URL"`.
- **Migrations**: author them, but do not run against production without explicit user go-ahead. Same for merging any PR — this session's established pattern (branch → PR → explicit "yes merge it" → merge) held throughout and should continue.
- **`gh` is authenticated as `adme-dev`** (not `Paul008`, which gets 403 on this repo).
- **CI/deploy takes ~12 minutes** on a merge to `main`. Use a single backgrounded `gh run watch <id> --exit-status` (one notification on completion), not the `Monitor` tool wrapping it (burns context on redraws).
- **Subagent messaging quirk this session**: background `Agent`-tool subagents frequently sent `idle_notification` pings with no content attached, requiring an explicit follow-up `SendMessage` asking them to call `SendMessage(to="main")` with their actual report — don't assume a bare idle notification means "nothing to report," always check if the real content ever arrived.
- **Pilot client for everything tracking-related**: South Morang Motor Group, `tracking_sites.id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`, `write_key = 'xf_AGssQKpct8RI3bvtYWx5RtJl'`, real site `https://www.southmorangmotorgroup.com.au` (Next.js, vehicle URLs like `/cars/used-{color}-{year}-{make}-{model}-s{stocknumber}`, no `Vehicle`/`Car` JSON-LD — only `AutoDealer` — so make/model still can't be extracted from structured data on this specific site; only the URL-pattern/stock-number path works today).
