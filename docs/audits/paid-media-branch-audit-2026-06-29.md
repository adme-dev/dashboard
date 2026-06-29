# Paid Media Branch Audit

**Date:** 2026-06-29
**Current baseline:** `main` / `origin/main` at `7f1a89ac`
**Purpose:** Decide what still needs porting from old paid-media branches after Sprint 1 shipped canonical budget identity, action dedupe, stale-sync guards, execute guardrails, cache invalidation, analytics degradation, and social-dashboard feed alignment.

## Summary

Do not direct-merge any audited branch. Each branch is old enough that a normal merge would remove large amounts of newer platform work. Treat them as reference branches only.

Current recommendation:

1. Archive `feature/meta-google-pacing-review` after resolving or discarding its two import-only dirty worktree edits.
2. Keep `hotfix/social-pacing-prod-import` as reference for two possible future slices: investigation endpoint and budget-writer abstraction/apply naming. Port only with fresh tests from `main`.
3. Archive `spend/meta-sync-queue-completion` as superseded by current `main` queue fan-out and queue-consumer code, unless live sync QA finds a regression.

## Branch: `feature/meta-google-pacing-review`

Status:

- Local worktree: `.worktrees/meta-google-pacing-review`
- Branch is old and diverged from `main`.
- Dirty worktree contains only import-path edits:
  - `app/components/social/SpendCampaignHistorySlideover.vue`
  - `test/utils/socialSpendHistory.test.ts`

Unique branch intent:

- Add AI pacing review.
- Add campaign action log/history.
- Add plan/approve/cancel action lifecycle.
- Add active action indexes and duplicate prevention.
- Add campaign history UI and cancellation/approval display.
- Add budget-control settings.

Current `main` coverage:

- `server/utils/campaignActionLog.ts`
- `server/api/agency/social/spend/[id]/actions/plan.post.ts`
- `server/api/agency/social/spend/[id]/actions/[actionId]/approve.post.ts`
- `server/api/agency/social/spend/[id]/actions/[actionId]/cancel.post.ts`
- `server/api/agency/social/spend/[id]/actions/[actionId]/execute.post.ts`
- `server/utils/campaignBudgetIdentity.ts`
- `server/utils/spendSyncFreshness.ts`
- `test/server/api/socialSpendPlanCampaignActionEndpoint.test.ts`
- `test/server/api/socialSpendExecuteActionEndpoint.test.ts`
- `test/server/utils/campaignBudgetIdentity.test.ts`
- `test/server/utils/campaignBudgetCrossRouteConsistency.test.ts`

Decision:

- No further porting from this branch is recommended.
- The current `main` implementation is safer because it adds canonical budget keys, stale-sync blocking, duplicate execute blocking, and analytics cache invalidation that this old branch does not have.
- Resolve the two import-only dirty edits before deleting the worktree.

## Branch: `hotfix/social-pacing-prod-import`

Status:

- Local worktree: `.worktrees/social-pacing-prod-hotfix`
- Ahead of old baseline, far behind current `main`.
- Direct merge would delete or downgrade newer spend, analytics, social publishing, inbox, AI, and video work.

Unique branch intent:

- Add campaign pacing investigation utility and endpoint.
- Add intervention metadata/actions.
- Add `apply.post.ts` for approved campaign pacing actions.
- Add `socialBudgetWriters.ts` abstraction for Meta/Google budget writers.
- Add hardening around apply-ready metadata and unsafe intervention actions.

Current `main` coverage:

- Live budget execution exists as `execute.post.ts`, not `apply.post.ts`.
- `execute.post.ts` already blocks when live writes are disabled, sync is stale, the action is already executing/applied, or guardrails fail.
- Main has tests for duplicate execute, stale sync, disabled live writes, and claim release.

Potential future port candidates:

- **Investigation endpoint:** `actions/investigate.post.ts` and related utility may still be useful as a read-only diagnostic slice. Port separately with a fresh route name and tests.
- **Budget writer abstraction:** `socialBudgetWriters.ts` may be worth extracting if the current execute endpoint grows. Do not replace current execution behavior without preserving existing guardrails.
- **UI intervention controls:** only after the backend diagnostic/apply contract is reviewed against current `main`.

Decision:

- Do not merge.
- Create fresh tasks only if the investigation endpoint or writer abstraction is still product-relevant.

## Branch: `spend/meta-sync-queue-completion`

Status:

- Historical branch with four unique commits.
- Direct merge would delete many newer social inbox, social publishing, reporting, spend, and queue files.

Unique branch intent:

- Run Meta sync on the queue consumer.
- Chunk Meta sync per account.
- Render connection health strip and live cross-platform sync UX.

Current `main` coverage:

- `server/api/agency/social/meta/sync-spend.post.ts` fans out `spend.sync.meta.account` queue messages.
- `server/api/agency/social/google/sync-spend.post.ts` fans out `spend.sync.google.account` queue messages.
- `server/utils/spendSync.ts` has per-account Meta and Google sync entry points.
- `server/utils/spendSyncKickoff.ts` fans out Meta and Google account jobs from scheduled sync.
- `workers/jobs-consumer` consumes the `agency-jobs` queue with DLQ configuration.
- Tests cover Google queue fan-out and scheduled Meta/Google fan-out.

Decision:

- Treat as superseded.
- Keep only as historical reference if live sync QA finds a queue regression.

## Next Actions

- [ ] Resolve/import-only dirty edits in `.worktrees/meta-google-pacing-review`, then archive/delete that worktree.
- [ ] Decide whether to build a read-only campaign investigation endpoint from `hotfix/social-pacing-prod-import`.
- [ ] Decide whether to extract `socialBudgetWriters.ts` as a refactor of current `execute.post.ts`.
- [ ] Run live sync QA for Meta/Google queue fan-out before archiving `spend/meta-sync-queue-completion`.
- [ ] Update `docs/prd/platform-completion-roadmap-2026-06-29.md` after these decisions.
