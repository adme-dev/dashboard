# Spend auto-action engine (v1) — design

**Date:** 2026-06-16
**Branch:** `feat/spend-auto-action`
**Builds on:** the pacing-review detectors (`socialSpendPacingReview.ts`), the guard-railed budget-write chain (plan→approve→execute), `recordCampaignAction` + the `source`-keyed dedupe, `createNotification`, and the existing budget cron rails (pages-cron worker).
**Research basis:** `docs/research/2026-06-16-ai-campaign-tooling.md` (roadmap #1 — the agency differentiator: guard-railed auto-action + accountability over many accounts).

## Problem / goal
We already *detect* ad-spend pacing/delivery problems (6 signals) and we can *write* budgets with guardrails — but a human still has to notice each signal and act. The auto-action engine closes that loop: on a pacing signal, it can (per a per-severity policy) notify and/or **auto-propose a budget adjustment** into the existing approve→apply queue. This is the vendor-class "rules/auto-action" layer (Revealbot/Madgicx), differentiated by our guardrails + audit + multi-account accountability.

## Decisions (confirmed)
- **Autonomy ceiling = notify + auto-propose.** v1 creates **planned** budget actions for a human to approve+apply; it performs **no autonomous platform writes.** (Autopilot deferred — the live write is still unproven.)
- **Action type = budget-scale only** (reuse the guard-railed write). Pause/resume deferred (new platform status-write).
- **Rule model = fixed per-severity policy.** The 6 existing detectors are the triggers; a policy maps `severity → mode` (`off | notify | propose`), with optional per-client overrides. A configurable condition-builder is deferred.
- **Ships dormant** — policy defaults to `enabled: false` / all severities `off`.

## Architecture

### 1. Pure decision engine — `server/utils/spendAutoAction.ts` (new)
```ts
type AutoActionMode = 'off' | 'notify' | 'propose'
interface AutoActionPolicy {
  enabled: boolean
  perSeverity: { critical: AutoActionMode; warning: AutoActionMode; info: AutoActionMode }
  clientOverrides?: Record<string, Partial<{ perSeverity: ... }>>  // keyed by clientId
}
interface AutoActionDecision { item: PacingReviewItem; mode: AutoActionMode }
decideAutoActions(items: PacingReviewItem[], policy: AutoActionPolicy): AutoActionDecision[]
```
- For each pacing item: if `!policy.enabled` → all `off`. Else look up the mode for `item.severity`, applying a `clientOverrides[item.clientId]` if present. Drop `off` decisions from the result.
- Excludes `stale_sync` items from `propose` regardless of policy (stale data must not drive an auto-proposal — downgrade to `notify`); this rule lives in the pure engine and is unit-tested.
- Pure — no I/O, fully testable. Fail-safe: a malformed item is skipped.

### 2. Policy storage — `agency_settings` key `spend_auto_action`
- JSONB, same pattern as `socialBudgetControlConfig` (`getSpendAutoActionPolicy(tenantId)` / `saveSpendAutoActionPolicy`). Default = `{ enabled: false, perSeverity: { critical: 'off', warning: 'off', info: 'off' } }`.
- Tenant resolved the same way the budget-control config is (single-tenant prod; the cron resolves it identically to how budget-control flags are read).

### 3. Executor — `server/utils/spendAutoActionExecutor.ts` (new, injected deps)
For each non-`off` decision:
- **`propose`** → `recordCampaignAction({ mediaSpendId, platform, actionType:'budget_update', actionStatus:'planned', previousValue:{dailyBudget:currentDailyBudget}, newValue:{dailyBudget:recommendedDailyBudget}, reason:item.recommendedAction, metadata:{ source:'auto_action', issueType, severity, autoProposed:true } })`, **after a dedupe check** — skip if a `planned`-or-`approved` `auto_action` row already exists for that `media_spend_id` at that budget (same query shape as `plan.post.ts`). Creates **NO platform write**. Then a `notify`.
- **`notify`** → `createNotification(...)` to the spend/finance recipients summarizing the issue (in-app). (Slack pacing digest already exists separately.)
- Fail-safe per item: a failure is logged + skipped; the run continues. Returns counts `{ proposed, notified, skipped }`.

### 4. Cron — `server/api/cron/spend-auto-action.post.ts` (new) + pages-cron worker entry
- Hourly, `x-cron-secret` auth (mirrors `budget-slack-digest`). Self-gate optional (can run hourly; dedupe makes it idempotent).
- Loads the policy; if `!enabled` → no-op. Builds the pacing review (cross-account via `PACING_REVIEW_SELECT_COLUMNS` + `buildPacingReview`, as the spend page does), runs `decideAutoActions`, runs the executor.
- Added to the existing **pages-cron companion worker** schedule (Pages has no native `scheduled()` — operator adds the route, same as other crons). Ships dormant via the `enabled:false` policy even once the cron route is live.

### 5. Surface (minimal, reuse existing)
- Auto-proposed actions are ordinary `planned` `campaign_action_log` rows → they already appear in the pacing review + `SpendCampaignHistorySlideover`. Tagged `metadata.source='auto_action'` so the UI shows an **"Auto-proposed"** badge (small addition to the existing action list rendering). The human approves + applies through the existing flag-gated chain.
- **Settings UI:** a "Spend automation" panel (enable toggle + a `severity → mode` selector for critical/warning/info) reusing the budget-control settings pattern, backed by `spend-auto-action-settings` GET/PUT (`requireRole(['owner','admin'])`, `getSelectedTenant`).

## Safety
- **No autonomous platform writes in v1** — `propose` only creates planned rows; applying remains a human action behind `liveBudgetChangesEnabled + per-platform` flags. So even a buggy policy cannot move client money.
- Ships dormant (`enabled:false`). Dedupe prevents proposal floods. `stale_sync` can never auto-propose. Engine + executor are fail-safe (skip-and-continue).

## Testing
- **`spendAutoAction.test.ts`** (pure): severity→mode mapping; `enabled:false` ⇒ all off; client overrides; `stale_sync` downgraded from propose→notify; off decisions dropped; malformed item skipped.
- **`spendAutoActionExecutor.test.ts`**: propose calls `recordCampaignAction` with `source:'auto_action'` + dedupe skip when an existing planned/approved auto_action row is present (injected mocks); notify calls `createNotification`; per-item failure is isolated.
- Cron + settings endpoint are integration-level (consistent with existing crons/settings endpoints).

## Files
- Create: `server/utils/spendAutoAction.ts`, `server/utils/spendAutoActionExecutor.ts`, `server/utils/spendAutoActionConfig.ts`, `server/api/cron/spend-auto-action.post.ts`, `server/api/agency/social/spend/auto-action-settings.get.ts` + `.put.ts`, tests for the two pure/executor modules. Settings UI component (reuse budget-control panel pattern).
- Modify: the action-list rendering to show an "Auto-proposed" badge for `source='auto_action'`; the pages-cron worker schedule (operator).

## Deferred (future phases)
Autopilot (auto-execute), pause/resume actions, configurable condition rules (ROAS/CPA thresholds + AND/OR), per-rule scheduling/dayparting, Slack routing of proposals.

## No migration
Reuses `campaign_action_log` (+ existing statuses/`source` metadata) and `agency_settings`.
