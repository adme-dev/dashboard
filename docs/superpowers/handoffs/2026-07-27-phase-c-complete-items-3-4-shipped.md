# Handoff — Phase C complete: items 3 & 4 built, reviewed, merged, deployed

Date: 2026-07-27. Continues from `docs/superpowers/handoffs/2026-07-27-phase-c-items-1-2-shipped.md` (items 1/2) and `docs/superpowers/handoffs/2026-07-27-phase-c-item3-exclusion-audiences-shipped.md` (item 3, now stale — it was written pre-merge).

## Where things stand right now

**All 4 Phase C (ad-spend efficiency) items are now merged to `main`:**
1. Conversion value passing — PR #307, merged, migration 310 live.
2. Intent-tier scoring — PR #308, merged, migration 311 live.
3. Exclusion audiences — PR #309, merged (`ad300b84`), migration 312 applied to production this session, deploy completed successfully.
4. GA4 micro-conversions — PR #310, merged (`85600265`), migration 313 applied to production this session.

`origin/main` HEAD: `85600265`.

## Deploy status

**PR #310's post-merge deploy completed successfully** (GitHub Actions run `30232779048`, `conclusion: success`, confirmed before this handoff was written). Combined with PR #309's deploy (also confirmed successful), **all 4 Phase C items are live in production** — no follow-up deploy check needed at the start of the next session.

## Item 3 (exclusion audiences) — build summary

One blended exclusion list per client from `competitive_referrer`/`exit_intent` (already-tracked signals), computed nightly by extending the existing tier-recompute cron, exported through the existing activation-request pipeline. Design: `docs/superpowers/specs/2026-07-27-phase-c-exclusion-audiences-design.md`. Plan: `docs/superpowers/plans/2026-07-27-phase-c-exclusion-audiences.md`. Built via subagent-driven-development, 6 tasks (2 needed one fix round each), final whole-branch review clean. Migration 312 (adds `crm_persona_definitions.is_exclusion` + `crm_persona_exclusion_memberships`) is now live in production — verified via `\d crm_persona_exclusion_memberships` and the seeded `negative_signal_exclusion` definition.

## Item 4 (GA4 micro-conversions) — build summary

Delivers `phone_click`/`add_to_wishlist`/`form_submit` (already-firing browser signals) to GA4 Measurement Protocol only, relying on each client's native GA4↔Google Ads Link rather than a second Data Manager call. Design: `docs/superpowers/specs/2026-07-27-phase-c-micro-conversions-design.md`. Plan: `docs/superpowers/plans/2026-07-27-phase-c-micro-conversions.md`. Built via subagent-driven-development, 7 tasks (2 needed fix rounds). Migration 313 (adds `tracking_events.ga_client_id`, widens `platform`/`event_name`/capability-mode CHECK constraints to include `ga4`) is now live in production.

**This one had by far the most eventful review cycle of the whole Phase C effort** — worth understanding before touching this subsystem again:

- **Final whole-branch review found a genuine Critical bug**: GA4 destination-creation validation had been generalized (via a `PLATFORM_MODE_PREFIX` map) in `ConversionDestinationCreateSchema` — a schema with **zero production callers**. The real production path (`DestinationConfigurationInputSchema` → `CreateConversionDestinationConfigurationSchema`/`UpdateConversionDestinationConfigurationSchema` → `destinationService.ts`) still had the old binary `platform === 'meta' ? ... : ...` ternary, so no operator could ever configure a GA4 destination. Fixed, plus 4 Important findings in the same fix wave (missing `gaClientId` field causing real TS compile errors in 3 unrelated files — `leads/statusTransition.ts`, `leads/intake.ts`, `crm/opportunityStageTransition.ts`; the client-portal measurement health endpoint would 500 on any GA4 destination; GA4 delivery had no fallback to durably-stored attribution data unlike `gclid`/`gbraid`/`wbraid`; a type-safety gap in the platform-prefix map itself).
- **The same defect class (binary meta/google logic, never updated for `ga4`) turned up FOUR more times** across successive re-reviews, each one caught and fixed in its own small wave:
  1. `destinationRepository.ts`'s `invalidPlatformMode` check (blocked editing an existing GA4 destination) + `healthRepository.ts`'s `platformMatches` check (blocked recording GA4 validation evidence).
  2. `connectionPlatform()` in `destinationRepository.ts` + a matching SQL `CASE` in `providerTestRepository.ts` (mapped `ga4` to `'google'` when looking up `social_connections`, breaking a GA4 destination linked to a real GA4 OAuth connection).
  3. **Found during a final independent review pass, after the SDD process had already declared the branch done**: `repository.ts`'s delivery-completion logic (`successful = result.outcome === 'accepted' && claim.platform === 'meta'`) never recognized `ga4` — every successful GA4 delivery would have permanently written `health_status: 'degraded'` and never set `last_success_at`, and GA4 credential-missing failures wouldn't classify as `'blocked'`. Fixed in commit `87a9ce21`, the very last commit before merge.
- **Lesson for future work on this measurement/destination subsystem**: the platform enum (`meta` | `google_data_manager` | `ga4`) is currently re-declared by hand in at least 6-8 places across `contracts.ts`, `destinationRepository.ts`, `healthRepository.ts`, `providerTestRepository.ts`, `repository.ts` (the Worker), plus 2 Vue components. Every one of them needs to agree, and none of them currently share a single source of truth. If a 5th platform is ever added, expect the same hunt-and-fix pattern to repeat unless this gets refactored to derive from one exported type. Grepping for `'meta'` and `'google_data_manager'` string literals side by side is the fastest way to find every remaining site.
- **A tooling mishap occurred and was corrected mid-session**: during one fix-wave dispatch, a subagent's `git commit` landed on the **primary checkout's branch** (`release/send-scan-foundation`, a completely separate, unrelated piece of work with 236 pre-existing uncommitted files) instead of the feature worktree. Caught immediately via a commit-hash mismatch between the subagent's report and `git log`. Corrected surgically: confirmed the stray commit was unpushed and touched only the 2 intended files, `git reset --mixed` the primary checkout back to its prior commit, `git restore --source=<prior-commit>` on just those 2 files, confirmed the 236-file modified list was byte-for-byte unchanged. Nothing was lost. No action needed from you here — just flagging that it happened and was handled, in case anything about the primary checkout's state seems unexpected.
- **A 4-test-file regression was caught during final full-suite verification** (not by any code reviewer): production code correctly gained a `gaClientId: null` field, but 4 test files (`opportunityStageTransition.test.ts`, `intake.test.ts`, `statusTransition.test.ts`, `providerTestService.test.ts`) asserted exact-match nested `attribution` object literals that didn't expect the new field. One-line-each fix, commit `e2b5be51`. Full suite is back to the documented baseline: 20 failing files / 39 failing tests, unrelated to this work (email panels, audio/video studio, spend controller, GA4 funnel, channel taxonomy, role resolver, leads webhook, deploy scripts, actionPlanAi, financialInsightsAi, groqFeatureKeyCoverage).

## Known gaps / non-goals, confirmed still true after merge

- **No UI for any of items 2, 3, or 4.** Intent-tier scoring, exclusion audiences, and GA4 destination configuration are all API-only — no Vue component exists for creating a tier/exclusion-filtered activation request, or for configuring a GA4 destination in `ClientMeasurementDestinationEditor.vue` (which still only knows `meta`/`google_data_manager`). This is now a 3-deep backlog item, not three separate footnotes — worth scoping as its own piece of work if there's appetite: a configuration UI covering tier/exclusion/GA4-destination setup.
- **Bounce-duration signal derivation** (item 3's deferred scope) — no exit/elapsed-time-on-page signal exists in `public/track.js` today; would need new instrumentation.
- **`finance_calculator_interact`/`test_drive_booking`/etc. as micro-conversions** (item 4's deferred scope) — these signal names exist in `signalLedger.ts`'s classification tables but are never actually emitted by `track.js`'s shipped code.
- **GA4 destination validation** (`healthRepository.recordValidation`) has zero production callers for ANY platform (not a GA4-specific gap) — a new GA4 destination will sit at `health_status: 'configured'` and fail the `delivery.ts:99` eligibility gate (`['ready','degraded']`) until something calls this. Pre-existing, not introduced by this branch, but will bite the first pilot-client GA4 rollout.
- **GA4 payload is user-level, not session-level** — `events: [{ name, params: {} }]` carries no `session_id`/`engagement_time_msec`, so correlation with the real GA4 session is via `client_id` only, not a full session match. Consistent with the design's stated scope, just worth knowing before assuming richer correlation.

## Practical notes carried forward from this session

- **`gh pr merge --delete-branch` fails locally** every time in this repo (`"main" is already used by worktree at ...` or similar) even though the merge succeeds via the API — verify with `gh pr view <N> --json state,mergedAt` after, then separately `git push origin --delete <branch>`.
- **Migrations get explicit go-ahead before `psql`, every time** — held for 310, 311, 312, and 313 this Phase C effort. Both 312 and 313 were applied production-side this session, confirmed via direct schema inspection (`\d <table>`) before merging their PRs, since this repo's CI auto-deploys `main`→prod and a deploy without the migration breaks live pages/crons immediately.
- **This session's two local feature worktrees** (`phase-c-exclusion-audiences`, `phase-c-micro-conversions`) still exist on disk with their now-merged, remote-deleted branches (`worktree-phase-c-exclusion-audiences`, `worktree-phase-c-micro-conversions`) — yours to clean up (`git worktree remove <path>`) whenever convenient, not urgent.
- **This handoff was written from a fresh worktree** (`phase-c-session-handoff`, off `origin/main` post-both-merges) and will be committed directly to `main` (docs-only, matches this session's own precedent for handoff docs).

## Recommendation for what's next

Phase C (ad-spend efficiency) is complete — all 4 originally-scoped items are built and live. There's no predetermined "item 5." Two real candidates surfaced during this work, in rough priority order:
1. **The shared UI-gap follow-up** — a configuration UI for tier-filtered/exclusion-filtered audience activation requests and GA4 destination setup, closing the API-only gap across items 2-4 at once.
2. **The platform-enum consolidation** — derive the `meta`/`google_data_manager`/`ga4` platform union from one exported type instead of ~8 hand-maintained copies, so the next platform addition doesn't repeat this session's 5-instance hunt-and-fix pattern.

Otherwise, ask the user what's next — Phase C's own scope is exhausted.
