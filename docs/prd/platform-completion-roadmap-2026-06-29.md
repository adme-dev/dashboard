# Platform Completion Roadmap and PRD

**Date:** 2026-06-29
**Baseline app code:** `7f1a89ac`
**Roadmap checkpoint:** maintained on `main`; docs-only commits may sit ahead of the deployed app-code baseline.
**Production:** `https://app.xeroflow.io` deployed from app code `7f1a89ac`
**Purpose:** Convert the current branch/worktree backlog into an ordered build plan that completes missing product pieces without regressing features already on `main`.

## Executive Summary

The repo has a clean, deployed `main`, but several branches and worktrees still hold unfinished or partially superseded work. The highest-risk area is paid media spend and budget control: several branches contain pacing actions, budget writers, duplicate-prevention work, and UI changes that overlap with the current spend module. These must be extracted carefully, not merged wholesale.

The recommended order is:

1. Stabilize spend, budget, analytics, and admin access on current `main`.
2. Reconcile paid-media pacing/action branches into a single safe budget-control slice.
3. Finish social publishing enterprise UX from existing specs and branch work.
4. Decide and complete media/video production slices that are still product-relevant.
5. Re-cut virtual office and PayPal only if still wanted.
6. Archive stale branches and prune dirty worktrees after their useful content is captured.

## Product Objective

Give ADME/XeroFlow one coherent agency operating platform where:

- Admins can assign access and see/manage all users without duplicate routes or partial-page reloads.
- Bookkeepers and finance users can access the right finance/Xero surfaces.
- Paid media budgets are linked to the correct client, platform, account, and campaign everywhere.
- Budget entries are immutable after creation except through explicit audited edits.
- Meta, Google, Budget Health, Analytics, and Spend routes read from the same campaign-budget mapping.
- Social publishing, media/video, and future modules complement existing workflows instead of replacing or removing shipped features.

## Current State

### Clean and deployed

- `main` is kept clean and equal to `origin/main` after each roadmap checkpoint.
- Production deploy succeeded from app code `7f1a89ac`; later roadmap/audit commits are docs-only unless noted otherwise.
- Smoke checks:
  - `https://app.xeroflow.io/auth/login` returned `200`.
  - `https://app.xeroflow.io/agency/analytics` returned `200`.
- Sprint 1 production deployment URL: `https://93952147.agency-dashboard-6cm.pages.dev`.
- Focused tests passed before deploy:
  - `test/server/utils/socialSpendAccuracy.test.ts`
  - `test/server/utils/socialSpendSummary.test.ts`
  - `test/server/api/socialSpendSummaryEndpoint.test.ts`
  - `test/server/api/socialSpendBulkBudgetEndpoint.test.ts`
  - `test/server/api/socialAccountSpendEndpoint.test.ts`
  - `test/server/api/adminUsers.test.ts`

### Sprint 1 shipped on main

The first roadmap sprint has been implemented and deployed. Relevant commits:

- `35630800` `fix: complete platform roadmap sprint fixes`
- `989bb1c9` `fix: improve analytics insights tab`
- `97a2abf3` `fix: add canonical campaign budget identity`
- `6dde4877` `fix: dedupe active campaign budget actions`
- `21fd14db` `fix: consolidate admin access management`
- `de8be3a1` `fix: degrade optional analytics source shape errors`
- `7eb27b1c` `test: cover cross-route campaign budget keys`
- `ab5d9ea8` `fix: add canonical social publishing calendar route`
- `5c4e4f7c` `feat: enrich social publishing analytics`
- `885ec5ce` `feat: enhance social publishing approvals`
- `fa386ba7` `fix: clear rejected social approval requests`
- `df2b1a5f` `feat: add publishing analytics AI summary`
- `9dc0a928` `fix: show publishing planner campaign count`
- `30aa941d` `fix: handle duplicate spend action executes`
- `8c11b7b7` `test: cover spend action execute guardrails`
- `3dc6a453` `fix: block stale spend budget actions`
- `60dd93ba` `fix: invalidate analytics budget caches`
- `e0a362ed` `test: cover single spend budget edits`
- `a42bd7ec` `fix: align social dashboard feed provider`
- `7f1a89ac` `fix: use content body scroll for client analytics`

Completed product outcomes:

- Admin user management now uses the canonical admin app shell and user API contract.
- Spend budgets now use canonical campaign budget identity across spend, Meta, Google, Budget Health, and Analytics API paths.
- Duplicate active spend actions are blocked by budget key, and duplicate/late execute requests return safe blocks instead of creating hidden duplicates.
- Stale spend sync data blocks budget action planning/execution.
- Single budget edits and bulk budget edits invalidate spend and analytics caches.
- Analytics blended metrics and internal benchmarks degrade when optional source shapes are unavailable instead of throwing avoidable 500s.
- The Analytics Insights tab has content and the client analytics route uses the agency content-body scroll surface.
- Social publishing has the first integrated shell/navigation/counts/analytics/approvals pass.
- The social-dashboard dealer feed provider contract is aligned with the sibling app's feed API shape.

Known remaining verification:

- Live cross-route budget comparison using real campaigns on Spend, Meta, Google, Budget Health, and Analytics.
- Formal branch audit notes for still-unmerged paid-media pacing/hotfix branches.

Completed follow-up verification:

- Admin live access QA for `Kellie White <accounts@adme.net.au>`: role changed from `admin` to `accounts`, which maps to `FINANCE` only; `/api/xero/status` confirmed ADME Xero connection is active. See `docs/audits/admin-access-qa-2026-06-29.md`.

### Branches already handled or superseded

These should not be direct-merged:

- `origin/feat/social-planner-campaign-board`
  - Unique commit: `13ed4c80 fix(social): correct spend account grouping`
  - Cherry-pick became empty after preserving current `main` spend summary/cache behavior.
  - Treat as superseded except for targeted comparison if a future regression appears.
- `origin/docs/ops-autopilot-brief-template-research`
  - Useful Monday job-type research was added to `main` as `cb6939a5`.
  - Remaining branch identity is cleanup-only.
- `origin/feat/ai-marketing-sync`
  - Cherry-pick became empty after preserving richer current marketing copy.
  - Cleanup-only.

## Active Work Inventory

| Area | Branch/worktree | Status | Risk | Recommendation |
| --- | --- | --- | --- | --- |
| Paid media pacing and budget actions | `feature/meta-google-pacing-review` | 28 commits ahead of `main`; dirty files in `SpendCampaignHistorySlideover.vue` and `test/utils/socialSpendHistory.test.ts` | High | Extract into a fresh branch from `main`; build tests around action lifecycle, dedupe, and live budget toggle before UI merge. |
| Paid media prod hotfix | `hotfix/social-pacing-prod-import` | 16 commits ahead, 567 behind `main` | High | Do not merge. Audit against pacing branch and cherry-pick only non-duplicated backend fixes. |
| Social publishing | `origin/feat/social-publishing` | 12 commits ahead of `main` | Medium | Compare against current social publishing pages and PRD; port missing UX and endpoints as independent slices. |
| Media Studio SP2c | `feat/media-studio-sp2c` | 37 commits ahead; dirty docs plan | Medium | Rebase/extract carefully. Verify editor, versions, restore, waveform, delete/duplicate behavior. |
| Video/AI producer harness | `.worktrees/publish-video-ai` | Large uncommitted diff, no committed delta over `main` | High | First commit or park changes on a branch, then split into reviewable slices. |
| Video composite spike | `spike/video-composite-render` | 24 spike commits; dirty package files | Medium | Treat as R&D. Extract only proven production pieces, then archive branch/worktree. |
| Virtual office media | `feat/virtual-office-1b-media` | 69 commits ahead; dirty worker package files; 1 local commit ahead of remote | Medium | Re-cut from current `main`; do not direct merge. Keep only still-wanted office/media UX. |
| PayPal finance route | `feat/paypal-finance-route` | 2 local commits, no upstream | Low/Medium | Needs product decision. Either finish connection flow or archive. |
| Audio handoff | `docs/handoff-audio-funnel-0602` | 1 commit ahead; untracked `workers/audio-jobs/pnpm-lock.yaml` | Low | Decide whether lockfile belongs; otherwise archive/prune. |

## Dormant and Activation Work Inventory

These items are already partly or fully merged, but still need activation, operator verification, or production flag decisions.

| Area | Current state | Blocker or finish-work | Recommendation |
| --- | --- | --- | --- |
| Google Business Profile publishing | Dormant on `main`; production flag expected to remain off until activation | Google Business Profile API approval/quota, production secrets, account reconnects | Activate only after Google approval; run publishing smoke tests before flipping the flag. |
| GA4 Agency Funnel | Clean extract is on `main`; older `feat/ga4-agency-funnel` branch is historical | Live data quality, client/property mapping coverage, operator UX feedback | Treat as QA/refinement, not merge work. |
| Voice Admin AI | Merged and flag-gated/live depending environment | Live-mic UAT, rate limits on speak/transcribe endpoints, marketing copy alignment | Add rate-limit work before broad use; schedule human UAT for voice confirmation. |
| Video Studio V1.3/V1.4 | Merged dormant behind `VIDEO_STUDIO_ENABLED=false` | Deeper code review, render queues/container, production bindings, real render verification | Keep dormant until operator activation checklist is complete. |
| Spend Meta sync queue completion | Historical branch `spend/meta-sync-queue-completion` exists separately from current spend work | May overlap with newer spend sync and pacing branches | Audit only after Phase 1; cherry-pick any still-relevant queue/health improvements. |

## Non-Goals

- No direct merge of stale branches into `main`.
- No autonomous live ad-budget writes.
- No removal of current shipped features while porting branch work.
- No cleanup of dirty worktrees until uncommitted changes are either committed, moved, or explicitly discarded.
- No production feature-flag flips without explicit activation criteria.

## Product Requirements

### PR1. Admin and Role Access

Admins need one SPA admin section that can manage users, roles, permissions, and sidebar access without duplicate routes or incomplete search results.

Acceptance:

- Kelly/bookkeeper-style users can be assigned the correct finance/Xero/sidebar access from the admin UI.
- `/admin/users` and any agency/admin equivalents use one canonical API contract.
- User search returns all expected users and does not create duplicate rows.
- Role updates update sidebar/page access on next navigation/API request.
- Admin pages remain SPA navigation under the Nuxt app shell.

### PR2. Spend and Budget Integrity

Media budgets must be stable and tied to the right client/campaign across Meta, Google, Budget Health, Spend, and Analytics.

Acceptance:

- Every budget entry has a stable owner key: tenant, client, platform, account, campaign external id, and period.
- Creating or searching budgets cannot create duplicate entries.
- Budget entries do not silently change after creation.
- Edits require explicit user action and audit entry.
- Meta Ads, Google Ads, Budget Health, and Analytics resolve budgets through the same mapping helper or data contract.
- Unsupported, stale, or unmapped campaigns cannot generate executable budget actions.

### PR3. Pacing Actions and Live Budget Controls

The platform can recommend, approve, cancel, and optionally apply pacing actions, with strict lifecycle and dedupe rules.

Acceptance:

- Planned, approved, cancelled, failed, and applied action states are represented consistently.
- Duplicate planned or approved actions are blocked by campaign/action/period/platform key.
- Applying live budget changes requires a human approval step and platform writer support.
- Failed applies preserve audit details and can be retried safely only when idempotent.
- UI labels clearly distinguish "recommendation", "approved action", and "applied platform change".

### PR4. Analytics Reliability

Analytics pages should not produce avoidable 500s or layout regressions.

Acceptance:

- `/agency/analytics` returns page shell and API calls without server 500 for blended metrics/internal benchmarks.
- `/agency/analytics/client/:id` uses full-width natural body scrolling.
- Blended metrics gracefully degrade when external source data is missing.
- Client analytics budget views use the same campaign-budget mapping as Spend and Budget Health.

### PR5. Social Publishing Completion

Social publishing should be an integrated operational suite, not scattered pages.

Acceptance:

- Social publishing has a consistent shell/nav with route counts and client context.
- Calendar, composer, queue, approvals, accounts, planner, and analytics share the same client/account model.
- Search/filter interactions do not create duplicate posts/accounts/campaigns.
- Publishing routes remain separate from paid-social spend routes.
- Existing composer and dispatcher behavior is preserved.

### PR6. Media and Video Production Completion

Media/video work should be extracted only where it supports the current production workflow.

Acceptance:

- Media Studio SP2c features are verified: versions, restore, project duplicate/delete, waveform keys, add-clip fallback.
- Video producer harness changes are split into small branches with tests before merge.
- Render/composite spike findings are documented; package changes are either promoted intentionally or removed.
- Social publishing hooks from video/media use the existing social post contract and do not bypass approval/scheduling rules.

### PR7. Branch and Worktree Hygiene

Old branches should stop looking like product backlog once useful work is captured.

Acceptance:

- Every active worktree is classified as: build, archive, or delete after commit.
- Stale superseded branches are documented and optionally deleted.
- Dirty worktrees are not pruned until their uncommitted changes are resolved.
- `main` remains deployable after every merge.

## Roadmap

### Phase 0: Baseline and Guardrails

Goal: protect production behavior before integrating branch work.

Tasks:

- [ ] Create a fresh integration branch from `main` for spend/budget work.
- [ ] Capture browser smoke checks for:
  - [ ] `/admin/users`
  - [ ] `/agency/social/spend`
  - [ ] `/agency/analytics`
  - [ ] `/agency/analytics/client/09164a83-ac69-43a7-9763-27474019f15b`
  - [ ] Meta Ads, Google Ads, Budget Health routes
- [ ] Record current API responses for user search, spend summary, budget health, blended analytics.
- [x] Add/extend regression tests for duplicate prevention and budget immutability.

Verification:

- [ ] `pnpm exec vitest run test/server/api/adminUsers.test.ts test/server/api/socialSpendSummaryEndpoint.test.ts test/server/api/socialSpendBulkBudgetEndpoint.test.ts test/server/api/socialAccountSpendEndpoint.test.ts`
- [ ] `npm run build`

### Phase 1: Spend/Budget Reconciliation

Goal: unify all budget, pacing, and action lifecycle work safely.

Tasks:

- [ ] Audit `feature/meta-google-pacing-review` commit-by-commit against current `main`.
- [ ] Audit `hotfix/social-pacing-prod-import` for backend fixes not already present.
- [x] Define canonical action lifecycle model.
- [x] Define canonical budget mapping key.
- [x] Port database migrations only after checking existing schema.
- [x] Port lifecycle helpers and tests first.
- [x] Port API endpoints for plan/approve/cancel/apply actions.
- [x] Port UI components only after endpoint tests pass.
- [x] Keep live apply disabled or guarded unless owner explicitly enables it.

Acceptance:

- [x] No duplicate planned/approved action rows for same campaign/action/period.
- [x] Budget updates invalidate all relevant cache keys.
- [x] Applying action writes an audit record before/after platform call.
- [x] Stale sync or missing campaign id blocks proposal/apply with an explanation.

Verification:

- [ ] `pnpm exec vitest run test/utils/socialSpendHistory.test.ts test/server/api/socialSpendBulkBudgetEndpoint.test.ts test/server/api/socialAccountSpendEndpoint.test.ts`
- [ ] Browser test spend action flow in local dev.
- [ ] `npm run build`

### Phase 2: Admin and Access Finish

Goal: finish the practical admin access gaps reported during use.

Tasks:

- [x] Map all admin/user/role routes and remove duplicate navigation paths.
- [x] Verify user listing query returns full tenant user set.
- [ ] Verify role assignment writes expected role/permission records.
- [ ] Confirm sidebar access for finance/bookkeeper role, including Xero/Zero surfaces.
- [x] Ensure admin pages are SPA routes and do not hard reload.

Acceptance:

- [ ] A bookkeeper can be granted finance/Xero visibility without owner-level access.
- [x] Searching users does not duplicate rows or hide valid users.
- [ ] Admin role edits are reflected in sidebar state.

Verification:

- [ ] `pnpm exec vitest run test/server/api/adminUsers.test.ts`
- [ ] Browser smoke with an admin session.

### Phase 3: Analytics and Budget Health Linkage

Goal: make analytics, budget health, Meta, and Google routes agree on budget ownership.

Tasks:

- [x] Identify every API that reads campaign budgets.
- [x] Route each through the canonical budget mapping helper.
- [x] Add tests for Meta/Google/platform alias handling.
- [x] Add graceful fallback for blended metrics/internal benchmarks 500 paths.
- [x] Confirm client analytics full-width natural scrolling remains intact.

Acceptance:

- [ ] Same campaign shows same budget on Spend, Meta, Google, Budget Health, and Analytics.
- [x] Missing benchmark data returns an empty/degraded state, not a 500.
- [x] Client analytics body scrolls naturally, full width.

Verification:

- [ ] Focused API tests for blended metrics/internal benchmarks.
- [ ] Browser smoke for analytics routes.
- [ ] `npm run build`

### Phase 4: Social Publishing Completion

Goal: finish the social publishing suite without colliding with paid-social spend.

Tasks:

- [ ] Compare current `app/pages/agency/social/publishing/*` with `docs/prd/social-publishing-enterprise-overhaul.md`.
- [ ] Compare `origin/feat/social-publishing` against current `main`.
- [x] Port missing shell/nav/counts as a first slice.
- [ ] Port missing queue/planner/approvals/account polish in later slices.
- [ ] Keep social publishing APIs under `server/api/agency/social/publishing/**`.

Acceptance:

- [ ] Publishing suite feels like one product area.
- [ ] Composer behavior remains intact.
- [ ] Scheduling, queue, approvals, and analytics use shared account/client context.

Verification:

- [ ] Social publishing API/unit tests.
- [ ] Browser smoke for calendar, compose, queue, approvals, accounts, analytics.

### Phase 5: Media/Video Production Decisions

Goal: decide which media/video work is production roadmap and which is spike cleanup.

Tasks:

- [ ] Commit or park `.worktrees/publish-video-ai` uncommitted changes to a named branch.
- [ ] Decide whether `feat/media-studio-sp2c` ships now or later.
- [ ] If shipping SP2c, rebase/extract into small vertical PRs.
- [ ] Extract only proven value from `spike/video-composite-render`.
- [ ] Remove or intentionally keep package/lockfile changes.

Acceptance:

- [ ] No dirty video/media worktree remains unexplained.
- [ ] Production-bound media changes have tests.
- [ ] Spike-only work is archived with findings.

Verification:

- [ ] `pnpm exec vitest run test/audio/ test/video/`
- [ ] Browser smoke for media project editor.
- [ ] `npm run build`

### Phase 6: Virtual Office and PayPal Decisions

Goal: avoid accidental large stale merges.

Tasks:

- [ ] Decide whether Virtual Office media/knock workflow is still wanted.
- [ ] If wanted, write a fresh mini-spec against current office/chat architecture.
- [ ] Re-cut wanted Virtual Office pieces from `main`; do not rebase 69 commits wholesale.
- [ ] Decide whether PayPal finance route is required in the next release.
- [ ] If wanted, extend PayPal work from metadata/helper into full connect/status/sync UI.

Acceptance:

- [ ] Virtual Office branch has a clear keep/archive decision.
- [ ] PayPal branch has a clear finish/archive decision.
- [ ] No broad dependency changes merge without review.

### Phase 7: Dormant Feature Activation

Goal: finish activation work for shipped-but-gated features without destabilizing the core spend/admin roadmap.

Tasks:

- [ ] Confirm Google Business Profile API approval/quota and required production secrets.
- [ ] Reconnect GBP accounts and run focused publishing smoke tests before enabling `GOOGLE_BUSINESS_PUBLISHING_ENABLED`.
- [ ] Run GA4 Agency Funnel live data QA for client/property mapping coverage.
- [ ] Add or verify rate limits for voice speak/transcribe endpoints before broad Voice Admin AI rollout.
- [ ] Run live-mic Voice Admin AI UAT: talk, transcript, response, spoken confirm on a safe write.
- [ ] Complete Video Studio code review and operator activation: queues, DLQ, worker/container, bindings, `VIDEO_STUDIO_ENABLED`.
- [ ] Verify a real Video Studio render end-to-end in production-like infrastructure.

Acceptance:

- [ ] Dormant feature flags are changed only after their activation checklist passes.
- [ ] Activation steps are captured in a deployment note or runbook.
- [ ] Rollback plan is documented before enabling a dormant feature.

## Implementation Task List

### Epic A: Spend and Budget Safety

#### Task A1: Current-State Regression Harness

Description: Add tests and browser smoke notes that capture current expected behavior for users, spend summary, budget bulk update, and analytics route health.

Acceptance:

- [x] Tests fail if spend summary duplicates grouped campaigns.
- [x] Tests fail if bulk budget creation creates duplicate rows for the same key.
- [x] Tests cover `google` vs `google_ads` platform aliases.

Verify:

- [ ] `pnpm exec vitest run test/server/api/socialSpendSummaryEndpoint.test.ts test/server/api/socialSpendBulkBudgetEndpoint.test.ts test/server/api/adminUsers.test.ts`

#### Task A2: Canonical Campaign Budget Key

Description: Centralize budget identity into one helper used by Spend, Meta, Google, Budget Health, and Analytics.

Acceptance:

- [x] Key includes tenant/client/platform/account/campaign external id/period.
- [x] Null or missing external ids are handled explicitly.
- [x] Existing routes use helper instead of ad hoc matching.

Verify:

- [x] Unit tests for key generation and platform aliases.
- [x] Existing spend and analytics tests pass.

#### Task A3: Pacing Action Lifecycle Backend

Description: Extract lifecycle model from pacing branches: planned, approved, cancelled, failed, applied.

Acceptance:

- [x] Duplicate planned/approved actions are blocked.
- [x] Cancellation and apply audit are durable.
- [x] Existing approved action state is returned consistently to UI.

Verify:

- [ ] `pnpm exec vitest run test/utils/socialSpendHistory.test.ts`
- [x] API tests for approve/cancel/apply endpoints.

#### Task A4: Spend Controller UI Integration

Description: Reconcile action history, live budget toggle, controller panel, and dropdown layout with current `/agency/social/spend`.

Acceptance:

- [x] Dropdowns are not squashed at desktop or mobile widths.
- [x] Action states are visible and understandable.
- [x] Live budget controls are disabled unless backend says apply is safe.

Verify:

- [ ] Browser screenshot checks for `/agency/social/spend`.
- [ ] `npm run build`

### Epic B: Admin Access and SPA

#### Task B1: Admin Route Map

Description: Document and consolidate duplicate admin/user/role routes.

Acceptance:

- [x] One canonical users route.
- [x] One canonical roles/permissions route.
- [x] Redirects or nav links point to canonical SPA route.

Verify:

- [ ] Browser navigation does not hard reload.

#### Task B2: Bookkeeper Access Flow

Description: Ensure finance/bookkeeper users can be assigned finance/Xero sidebar access without owner/admin overreach.

Acceptance:

- [ ] Role assignment supports finance/bookkeeper access.
- [ ] Sidebar shows expected Xero/finance items after assignment.
- [ ] Restricted admin-only features remain hidden.

Verify:

- [ ] Admin API tests.
- [ ] Browser smoke with target user or seeded role.

### Epic C: Analytics and Budget Health

#### Task C1: Blended Metrics Failure Handling

Description: Fix 500 responses from blended metrics/internal benchmarks by returning explicit degraded states when source data is absent.

Acceptance:

- [x] No unhandled 500 for missing benchmark data.
- [x] UI can render empty/degraded state.

Verify:

- [ ] Focused endpoint tests.
- [ ] Browser console check on `/agency/analytics`.

#### Task C2: Cross-Route Budget Consistency

Description: Make Meta, Google, Budget Health, Analytics, and Spend resolve budgets through the same contract.

Acceptance:

- [x] Same campaign resolves same budget in every route.
- [x] Budget edits invalidate all affected route caches.

Verify:

- [x] Cross-route fixture tests.

### Epic D: Social Publishing

#### Task D1: Branch and PRD Diff

Description: Compare `origin/feat/social-publishing` and `docs/prd/social-publishing-enterprise-overhaul.md` to current `main`.

Acceptance:

- [ ] Missing pieces listed by route/component/API.
- [ ] Superseded branch commits marked cleanup-only.

Verify:

- [ ] Written diff notes committed to docs or PR description.

#### Task D2: Social Publishing Shell

Description: Add/finish shared shell/nav/counts for publishing routes.

Acceptance:

- [x] Calendar, compose, queue, approvals, accounts, planner, analytics share nav.
- [x] Counts load from one endpoint and degrade safely.

Verify:

- [ ] Browser smoke of all publishing routes.

### Epic E: Media/Video

#### Task E1: Park Dirty Producer Harness Work

Description: Convert uncommitted producer harness work into a branch/commit or explicit archive patch.

Acceptance:

- [ ] Worktree is no longer dirty without explanation.
- [ ] Changes are split into reviewable domains.

Verify:

- [ ] `git status` clean in that worktree after commit/archive.

#### Task E2: SP2c Extract Plan

Description: Split `feat/media-studio-sp2c` into reviewable vertical slices.

Acceptance:

- [ ] Versions/restore slice can ship independently.
- [ ] Project duplicate/delete slice can ship independently.
- [ ] Waveform/add-clip fixes can ship independently.

Verify:

- [ ] `pnpm exec vitest run test/audio/ test/video/`

### Epic F: Cleanup and Governance

#### Task F1: Branch Classification

Description: Mark each active branch as build, archive, or delete.

Acceptance:

- [ ] Superseded branches identified.
- [ ] Dirty worktrees resolved before prune.
- [ ] No stale branch is direct-merged into `main`.

Verify:

- [ ] `git branch -a --no-merged main` reviewed after cleanup.

### Epic G: Dormant Feature Activation

#### Task G1: GBP Activation Checklist

Description: Prepare Google Business Profile publishing activation without touching current spend/admin work.

Acceptance:

- [ ] API approval/quota confirmed.
- [ ] Production OAuth/client secrets configured.
- [ ] Accounts reconnected and publishing smoke tests pass.

Verify:

- [ ] Browser smoke for GBP account connect and test publish path.

#### Task G2: Voice Admin AI Production Hardening

Description: Finish voice-specific production hardening before broad staff rollout.

Acceptance:

- [ ] Speak/transcribe endpoints have rate limits equivalent to sibling voice endpoints.
- [ ] Live-mic UAT proves transcript, reply, and confirmation flow.
- [ ] Marketing pages describe actual hands-free/agentic behavior.

Verify:

- [ ] Focused API tests for rate limiting.
- [ ] Human live-mic smoke test.

#### Task G3: Video Studio Activation

Description: Activate Video Studio only after operator infrastructure and code review are complete.

Acceptance:

- [ ] Render queues and DLQ exist.
- [ ] Worker/container and bindings are deployed.
- [ ] A real render completes end-to-end.
- [ ] `VIDEO_STUDIO_ENABLED` is flipped only after rollback is documented.

Verify:

- [ ] Production-like render smoke test.
- [ ] `npm run build`

## Next Active Queue

Sprint 1 is shipped. Continue with the smallest next items that close real risk without reviving stale branches wholesale:

1. **Admin live access QA:** complete for `Kellie White <accounts@adme.net.au>`; role is now `accounts`, Xero connection is active, and the role no longer carries the ADMIN group.
2. **Paid-media branch audit:** complete. Use `docs/audits/paid-media-branch-audit-2026-06-29.md` for decisions; only the optional investigation endpoint / writer abstraction remain as possible fresh slices.
3. **Live cross-route budget QA:** use real campaigns to confirm Spend, Meta, Google, Budget Health, and Analytics show the same budget identity and values.
4. **Social publishing diff:** compare `origin/feat/social-publishing` and `docs/prd/social-publishing-enterprise-overhaul.md` to the now-shipped publishing shell; port only missing queue/planner/accounts polish.
5. **Brief/job P2 planning:** turn the structured campaign budget model, revived `field_mapping`, and AM intake/deadline surfacing into a small implementation plan.
6. **Dealer feeds P1b:** move to the sibling `social-dashboard` repo and add the service-auth/search/create-feed side needed by the XeroFlow provider.

Do not start media/video or virtual office integration until spend/budget/admin behavior is stable.

## Commands

Use these as default verification gates:

```bash
pnpm exec vitest run test/server/api/adminUsers.test.ts test/server/api/socialSpendSummaryEndpoint.test.ts test/server/api/socialSpendBulkBudgetEndpoint.test.ts test/server/api/socialAccountSpendEndpoint.test.ts
npm run build
pnpm run deploy
```

Additional targeted gates by area:

```bash
pnpm exec vitest run test/utils/socialSpendHistory.test.ts
pnpm exec vitest run test/audio/ test/video/
```

## Boundaries

Always:

- Preserve current `main` behavior unless a test and product requirement prove it should change.
- Add tests before integrating stale branch behavior.
- Keep money-moving actions human-confirmed and audited.
- Keep `main` deployable.

Ask first:

- Enabling live budget writes in production.
- Enabling dormant production flags such as GBP publishing or Video Studio.
- Adding dependencies.
- Running destructive cleanup on dirty worktrees.
- Deleting remote branches.
- Changing database constraints on production tables.

Never:

- Direct-merge stale long-lived branches.
- Remove current features to make an old branch fit.
- Commit secrets.
- Prune dirty worktrees without resolving their changes.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Stale branch overwrites newer spend grouping/cache behavior | High | Cherry-pick or manually port only tested helpers. |
| Duplicate budget/action rows | High | Canonical keys, unique constraints where safe, tests before UI. |
| Live budget write executes wrong campaign | High | Require platform campaign external id, stale-sync guard, human approval, audit. |
| Analytics 500s hide production regressions | Medium | Endpoint tests and graceful degraded states. |
| Dirty worktrees lose useful uncommitted work | Medium | Commit/park before prune. |
| Media/video scope consumes spend/admin time | Medium | Defer until Phase 5 unless explicitly reprioritized. |
| Dormant feature flag enabled before infrastructure is ready | High | Activation checklist, smoke test, rollback note before flag change. |

## Open Questions

1. Should live budget apply be enabled in production after approval, or stay propose/approve-only for now?
2. Is Virtual Office media still wanted in the near-term roadmap?
3. Is PayPal finance required, or should that branch be archived?
4. Should social publishing enterprise work start immediately after spend/admin, or wait until paid-media budget controls are complete?
5. Should old superseded remote branches be deleted after this roadmap is accepted?
6. Who should own live-mic UAT for Voice Admin AI?
7. Do we want to activate Google Business Profile publishing in the same release train as social publishing, or keep it separate?
8. What is the target date for Video Studio activation infrastructure?
