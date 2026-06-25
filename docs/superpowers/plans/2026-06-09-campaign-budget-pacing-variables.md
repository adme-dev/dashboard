# Campaign Budget Pacing Variables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display campaign-level budget pacing variables in Budget Health and align ad-spend alerts with the same calculations.

**Architecture:** Add a shared pure `server/utils/budgetPacing.ts` utility, extend `/api/agency/budget-alerts/health` with campaign rows, add a campaign pacing table to `FinancialBudgetHealthTab`, and update the existing ad-spend health analyser to consume the shared status model.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Nitro server API, Vitest.

---

### Task 1: Shared Pacing Utility

**Files:**
- Create: `test/server/utils/budgetPacing.test.ts`
- Create: `server/utils/budgetPacing.ts`

- [ ] Write failing tests for period math, daily budget math, pacing status thresholds, ended campaigns, and no-spend campaigns.
- [ ] Run `pnpm test:run test/server/utils/budgetPacing.test.ts` and verify the missing module failure.
- [ ] Implement `computeCampaignBudgetPacing`.
- [ ] Re-run the targeted test and verify it passes.

### Task 2: Budget Health API Campaign Rows

**Files:**
- Modify: `server/api/agency/budget-alerts/health.get.ts`

- [ ] Import `computeCampaignBudgetPacing`.
- [ ] Query campaign-level `media_spend` rows for the selected period with MTD daily spend.
- [ ] Return a `campaigns` array with the PDF-derived variables.
- [ ] Preserve existing `summary`, `clients`, and `burnRateTrends` response fields.

### Task 3: Budget Health Campaign UI

**Files:**
- Modify: `app/components/financial/BudgetHealthTab.vue`

- [ ] Add computed campaign rows from `healthData.campaigns`.
- [ ] Add local filters for platform, client, pacing status, and campaign search.
- [ ] Render a dense Nuxt UI-compatible campaign pacing table.
- [ ] Add status badges and currency formatting for the new variables.

### Task 4: Alert Alignment

**Files:**
- Modify: `server/utils/anomalyDetection/analysers/adspendHealth.ts`
- Modify: `test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`

- [ ] Use `computeCampaignBudgetPacing` in overspend and underspend detectors.
- [ ] Keep existing anomaly fingerprints stable.
- [ ] Add assertions that warning and critical thresholds match the shared utility.
- [ ] Re-run the ad-spend health analyser tests.

### Task 5: Verification

**Files:**
- Check modified files end-to-end.

- [ ] Run `pnpm test:run test/server/utils/budgetPacing.test.ts test/server/utils/anomalyDetection/analysers/adspendHealth.test.ts`.
- [ ] Run `pnpm run typecheck` if the local repo state allows it.
- [ ] Report any pre-existing failures separately from this change.
