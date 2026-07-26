# Handoff — Persona 360 batch review, tracking fixes, marketing-signal roadmap

Date: 2026-07-26. Session ran long (context exhausted); continue in a fresh session.

## Where things stand right now

`origin/main` HEAD: `b927384e` ("fix(tracking): dead-click race, dark behavioral signals, Consent Mode v2, dynamic vehicle detection", PR #304, merged).

### Background: how we got here

A separate Codex worktree session (`/private/tmp/dashboard-podium-provider-identity`) pushed ~33 commits directly to `main` over 2026-07-25/26 (`af4c2229..5d399181`), building a full "Persona 360" system: tenant-scoped identity resolution, consent/suppression control plane, Google/Meta audience activation, billing entitlements, CRM RBAC, job/queue infrastructure. User confirmed this was intentional (approved each step), but flagged the governance gap: future security-sensitive/billing work should go through protected branches + PR review, not direct pushes. That's the process this session followed from here on: **branch → PR → explicit go-ahead before merge → explicit go-ahead before running any migration against prod.**

### Review of that batch: 3 of 9 dimensions completed, 6 never reported back

I dispatched 9 parallel agents (via the `Agent` tool, not a `Workflow`) to review `af4c2229..5d399181` across the user's 9 stated priorities. **Only 3 reported findings before the conversation moved on to fixing them; the other 6 were dispatched but never returned a result (no completion notification arrived — likely died silently or are still idle).** These need to be **re-dispatched fresh** in the new session — don't try to resume the old agent IDs, they won't carry over. Re-review against the *current* `main` (some of the reviewed code has since been touched by this session's own fixes).

**Completed reviews (findings already fixed, see below):**
1. Consent, suppression, identity reconciliation
2. API authentication and production observability
3. Provider credential and token handling

**Never completed — re-dispatch these in the new session:**
4. Tenant isolation and portal RBAC
5. Audience export authorization and approval controls
6. Billing entitlements, limits, and defaults
7. Migration safety, idempotency, and rollback (there's a known oddity worth re-flagging: migrations `283`/`288`, `284`/`289`, `285`/`290` have identical descriptive names but different numbers — never got a conclusive read on whether that's a harmless renumbering or an actual double-apply risk)
8. Queue retries and duplicate execution
9. Missing automated tests

Use the same review-only discipline: no pushes/reverts/migrations without explicit approval, read-only `git diff`/`git show` against the commit range, general-purpose subagents (not `Explore` — it's explicitly not for code review).

### Fixes shipped from the 3 completed reviews — PR #303 (merged, migration 307 run)

- **Critical**: consent-withdrawal deadlock — a trigger from migration 298 gated eligibility checks on the export's operation instead of the member row's own operation, so a person who withdrew consent could never actually be removed from a live Google/Meta audience export (it would raise and retry forever). Fixed via forward-fix migration `307_persona_export_member_consent_removal_fix.sql` (**run against prod**) + a suppression filter added to `loadEligibleMembers` in `audienceSync.ts`.
- **High**: `super_admin` privilege-escalation bypass in `hasRole()`/`roleHasPermission()`/`useAuth` — removed (was unreachable today, one enum value from live).
- **High**: `/api/internal/process-job` failed open when `CRON_SECRET` was unset — now fails closed, constant-time compare.
- **Medium**: production CORS honored `localhost` origins and reflected `allow-credentials: true` on public tracking endpoints — tightened.
- **Medium**: 3 login endpoints derived cookie `Secure` flag from a spoofable `x-forwarded-proto`-derived header instead of `NODE_ENV` — fixed.
- **Medium**: Google lead webhook logged the client's plaintext webhook secret + raw headers to an error table, even on legitimate traffic — switched to the redacted diagnostic pattern its sibling webhooks already used.
- **Low-medium**: client-portal `audiences.get.ts` returned raw provider error messages, bypassing the redaction policy its sibling endpoint already enforced — now code-only.

**Known, deliberately not fixed (flagged, out of scope for that PR):** two pre-existing test failures (`test/server/utils/roleResolver.test.ts` — owner permission-group count/lookup mismatch) and one broken test mock (`test/server/api/leads/webhook-google.test.ts` — missing `transaction` export in a `vi.mock`), confirmed present on unmodified `origin/main` via `git stash`, not introduced by any fix here. ~75 pre-existing lint errors across the touched files too (this session's edits net *reduced* the count, didn't add to it). None of this was addressed — still open.

### Tracking-script gaps — PR #304 (merged, migration 308 run), verified live in production

Found by auditing the real production write key `xf_AGssQKpct8RI3bvtYWx5RtJl` (South Morang Motor Group, the Persona 360 pilot client — `tracking_sites.id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`, `client_id = '1548b4d1-1857-46da-8f6a-38ca6c46f808'`) against 32,682 real events, plus current external best practice research (Meta CAPI/Google Enhanced Conversions, Consent Mode v2, automotive CDP identity-resolution patterns).

Fixed:
1. **Dead-click detection race** — each tracked click installed its own `history.pushState` wrapper and restored the *original* (not prior wrapper) 500ms later; concurrent clicks within 500ms stomped on each other. Consolidated into one shared nav tracker (`_lastNavAt`), restricted to actually-navigational elements (`a[href]`, `button[type=submit]`).
2. **Behavioral signals were 100% dark in production** — rage-click/video/idle/form-field-timing were fully coded but gated behind `config.behavioral`, which the snippet generator never set. Now on by default (`data-behavioral="false"` to opt out).
3. **Google Consent Mode v2 gtag signals added** (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`) — were entirely absent.
4. **`tracking_sites.consent_mode` was a dead UI control** — staff could set it, `track.post.ts` never read it. Wired in via `applySiteConsentMode()` in `consent.ts`.
5. **Vehicle-page URL detection made dynamic** — South Morang's real URLs (`/cars/used-black-2021-mercedes-benz-v-class-s20544`) matched none of the 3 hardcoded patterns, so `vehicle_view` never fired for the flagship automotive client. Migration `308_tracking_vehicle_page_patterns.sql` (**run against prod**) adds `tracking_sites.vehicle_page_patterns` (mirrors the existing `lead_selectors` column), delivered via a `data-vehicle-patterns` snippet attribute (no fetch/race). Built-in list also broadened (+`cars`, `inventory`, `vdp`, `stock`, `vehicle-details`) and a stock-number-suffix heuristic added.
6. **New test-URL diagnostic tool** — `POST /api/agency/tracking/:id/test-url` (SSRF-guarded via the existing `validateCatalogFeedUrl`), wired into a "Test a vehicle page" section in `InstallSnippet.vue`, lets staff confirm detection before installing anything on a new dealer site.

**Deploy verified live** (2026-07-26 ~08:03 UTC): CI/deploy run `30193546616` succeeded (11m47s), confirmed the *actual served* `https://app.xeroflow.io/track.js` contains the new code (grepped for `VEHICLE_PAGE_PATTERNS`/`_lastNavAt`/`consentModeParams`/`isNavigational`), and confirmed South Morang's site is still posting events normally post-deploy (no breakage). **Not yet observed**: any of the new event types (`vehicle_view`, `rage_click`, `video_*`, `idle_*`) actually firing — expected, since it had only been minutes since deploy and those need specific visitor behavior (a `/cars/...` page visit, rapid clicking, video playback, idle-then-return) to trigger. **First thing to check in the new session**: query `tracking_events` for South Morang (`site_id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`) for `vehicle_view` and any behavioral event names — if still zero after real traffic has passed, something's wrong and needs debugging (check served script is current, check South Morang's actual `/cars/*` pages are getting visited, check browser console for JS errors).

## Next body of work: marketing-signal data collection roadmap

User wants this implemented next, in priority order. Framing: signals that improve ad targeting, lower spend, and assist discovery/purchase for the dealer client.

**Phase A — foundation (mostly done, confirm before building on it)**
- Vehicle-page detection + per-site patterns — shipped in #304, verify it's actually producing `vehicle_view` events for real dealer traffic before building anything downstream that depends on it (see "first thing to check" above).
- Consent Mode v2 signals — done (#304).

**Phase B — funnel & intent signals (small `track.js` additions, no new infra)**
1. Cross-shop/comparison-set tracking — track distinct VINs viewed per session (once vehicle_view is confirmed reliable).
2. Return-to-vehicle — reserved in `DATALAYER_EVENTS` (`return_to_vehicle`) but never implemented. Small localStorage map: VIN → last-seen timestamp: a visitor returning to the *same* VIN across sessions is a top purchase-intent signal.
3. VDP dwell time — distinct from generic `engagement`; time actually spent on a vehicle detail page specifically.
4. Exit-intent detection — mouse trajectory toward the tab bar; powers both remarketing and real-time on-site recovery (chat prompt, offer banner).
5. Wishlist/save tracking — heuristic detector for save/heart icons near vehicle cards.
6. Scroll/CTA *visibility* via IntersectionObserver instead of raw scroll-percent — "did they see the price/CTA," not "did they scroll past that pixel row."

**Phase C — ad-spend efficiency (needs the audience/persona pipeline that already exists)**
7. Intent-tier scoring (hot/warm/cold) combining cross-shop depth + VDP dwell + form-start, exported as separate Customer Match/Custom Audience tiers — highest-leverage item for lowering spend.
8. Exclusion audiences from negative signals — bounced <3s, or viewed then immediately clicked a `competitive_referrer` link (already collected, currently unused for exclusion).
9. Conversion *value* passed to Meta CAPI / Google Enhanced Conversions — **confirm first** whether `workers/measurement-delivery` currently sends binary conversions or already includes a value parameter (this exists and looked mature on a quick look earlier this session — `deliverMetaConversionEvent`/`deliverGoogleDataManagerEvent` in `workers/measurement-delivery/src/providers.ts` — but value-passing specifically wasn't verified). If binary-only, pass the actual vehicle price as conversion value.
10. Micro-conversions ("used finance calculator", "viewed 3+ vehicles") fed to GA4/Google Ads as intermediate conversions, ahead of the final lead event.

**Phase D — bigger investment (needs the inventory-feed integration that exists elsewhere in this codebase — see `server/utils/crm/catalogFeed.ts` / `catalogSourceService.ts`)**
11. On-site search capture with zero-result flagging (once `search` tracking exists — currently no code path fires it at all, see below).
12. High-interest/low-stock VIN alerts — cross-reference `vehicle_view` volume per VIN against the dealer's actual inventory feed.
13. On-site "customers who viewed this also viewed" — same comparison-set signal as #1, surfaced back to the shopper directly rather than only used for ad platforms.

### Known related gap not yet fixed (found during the tracking audit, not yet addressed)

`search`, `filter_change`, `test_drive_booking`, `trade_in_start/complete`, `finance_calculator_interact`, `return_to_vehicle`, `vdp_scroll_depth` are all pre-wired into `track.js`'s `DATALAYER_EVENTS` GTM mapping (implying they're expected to exist) but **no code path in `track.js` ever calls `track()` with any of these names** — they need either bespoke per-site integration (a developer manually calling `window.xf.track('search', {...})` on the dealer's own site) or generic heuristic detectors built into the script (keyword-matching on click text/href for test-drive/trade-in/finance CTAs, a generic search-form detector, `vdp_scroll_depth` as a natural derivative of existing scroll + vehicle-context detection). This directly overlaps with roadmap items #1 and #11 above — planning them together makes sense.

## Key facts for the new session

- **Worktree**: `.claude/worktrees/fix+persona-review-findings`, branch `worktree-fix+persona-review-findings` (tracks `origin/fix/persona-360-review-findings`, already merged twice — start a **new** branch/worktree for the next batch of work rather than continuing on this one, since its base has drifted from what's now on `main` in spirit even though content-equivalent).
- **DB access**: `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)`, then `psql "$DATABASE_URL"`. `.env` is symlinked from the main repo checkout into any worktree.
- **Migrations**: author them, but **do not run against production without explicit user go-ahead** — this was the established pattern this whole session (asked before running 307 and 308). Same for merging any PR.
- **PR workflow**: branch off `origin/main` → commit → push → `gh pr create` → wait for explicit "merge it" before `gh pr merge --squash`. `gh` is authenticated as `adme-dev` (not `Paul008`, which gets 403 on this repo).
- **CI/deploy takes ~12 minutes** on a merge to `main` (heavy Nuxt build, matches the documented 16GB-heap requirement). Don't flood-poll it — use a single backgrounded `gh run watch <id> --exit-status` command (one notification on completion) rather than the `Monitor` tool wrapping `gh run watch` (its periodic redraws get treated as repeated near-identical events and burn context fast).
- **Pilot client for everything tracking-related**: South Morang Motor Group, `tracking_sites.id = '76ca2d2a-0541-4a29-87fb-23a6045f4ab5'`, `write_key = 'xf_AGssQKpct8RI3bvtYWx5RtJl'`, real site `https://www.southmorangmotorgroup.com.au` (Next.js, vehicle URLs like `/cars/used-{color}-{year}-{make}-{model}-s{stocknumber}`, JSON-LD only has `AutoDealer` schema — no `Vehicle`/`Car`/`Product` block, so make/model still can't be extracted from structured data on this specific site; only the URL-pattern/stock-number path works for them today).
