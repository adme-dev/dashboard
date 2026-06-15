# Real-time AI Pacing Analysis (human-in-the-loop) — Design Spec

**Date:** 2026-06-15
**Status:** Approved (brainstorming) — pending spec review
**Builds on:** [[budget-write-execution-feature]] (the approve→Apply guard-railed live-write chain shipped 2026-06-15)

## Goal

From the spend-table **Review** slideover, an operator clicks **"Analyze with AI"** to get a fresh, per-campaign AI analysis in real time. The AI proposes a recommended daily budget **with a written rationale**, shown **side-by-side** with the existing deterministic pacing number. The human picks one and clicks **"Approve this adjustment"**; an admin/owner then clicks the existing **"Apply to Meta/Google"** to perform the guard-railed live write. Human stays in the loop at both the approval and the apply gates.

## Why

Today the Review slideover shows a **deterministic** recommended daily budget (`computeCampaignBudgetPacing`) plus a **canned per-issue template** sentence (`actionByIssue[...]`). There is a Groq AI *summary*, but it is **list-level** (a narrative over the whole pacing review), not a per-campaign on-demand analysis that reasons about one campaign's metrics and proposes an adjustment. This feature adds that per-campaign, on-demand reasoning while keeping every existing safety guarantee.

## Locked Decisions

1. **AI output = both numbers, side-by-side.** Show the deterministic number AND the AI's proposed number + rationale; the human picks which to approve.
2. **Analysis input = latest synced data by default + optional per-campaign live refresh.** Default analyzes the last-synced metrics instantly (no API load) and shows freshness ("synced Nh ago"). An optional **"Refresh from platform"** re-pulls **only this one campaign** (one API call — not the 113-account fan-out that caused the Meta rate-limit burst) before analyzing. Fail-safe: a failed refetch (e.g. the known Google MCC `login-customer-id` read bug) falls back to synced data and flags it.
3. **Approval flow = dedicated "Approve this adjustment" that feeds the existing audited chain.** "Approve this adjustment" is the **approve** step: it records a `planned`+`approved` action in `campaign_action_log` with the chosen number and the AI rationale in metadata. The existing **admin/owner-only "Apply to Meta/Google"** button remains the final money gate. One audit trail; admin still gates the live write.
4. **Confidence + risk flags are displayed** alongside the AI number and rationale.
5. **No new migration.** Reuse `campaign_action_log` (jsonb `metadata`) and `media_spend`. The full budget-write guardrail engine (±20% clamp, relative caps, 1/campaign/day, read-back verification) still runs at Apply time, so an AI-proposed number can never escape the safety envelope.

## Architecture

A thin per-campaign analysis endpoint orchestrates: (optional single-campaign refresh) → deterministic pacing → Groq reasoning → structured result. A **pure** prompt-builder + tolerant response-parser unit holds all testable logic. The slideover gains a comparison card + an "Approve this adjustment" control that reuses the existing plan/approve endpoints. The existing admin Apply (already shipped) is unchanged.

### Components

**C1. Pure unit — `server/utils/spendAiAnalysis.ts`** (no I/O, fully unit-tested)
- `buildAnalysisPrompt(input): string` — builds the Groq prompt from campaign metrics + deterministic baseline (issue type, pacing ratio, MTD spend, monthly budget, projected month-end, performance signals, days remaining).
- `parseAnalysisResult(raw, baseline): AiAnalysisResult` — tolerant JSON parse of the model output; coerces/validates `proposedDailyBudget` (number ≥ 0), `rationale` (string), `confidence` ('low'|'medium'|'high'), `riskFlags` (string[]). **Fail-safe:** on unparseable/empty output, returns `{ ok: false }` so the endpoint degrades to deterministic-only. Clamps an absurd AI number to a sane multiple of current (defense-in-depth; the real guardrails run at Apply).
- Types: `AiAnalysisInput`, `AiAnalysisResult`.

**C2. Endpoint — `POST /api/agency/social/spend/[id]/ai-analysis`**
- `requireWriteAccess(event)` (media role — same as `plan`; analysis is read-only, no money moves here).
- Body: `{ refresh?: boolean }`.
- Load the campaign's pacing row (reuse the query/shape behind `pacing-review.get` / `socialSpendPacingReview`).
- If `refresh`: re-pull this single campaign's core metrics from the platform and update `media_spend`; on error, continue with synced data and set `dataFreshness.refreshed = false` + `refreshError`. **Note (verified):** `onDemandSync` only exposes per-campaign *breakdown*/*creative* sync, not core spend/budget refresh — so this needs a **new minimal single-campaign refetch helper** (Meta insights / Google GAQL for one campaign), not a reuse. It is an **independently deferrable** task: the default (synced data) analysis ships without it.
- Compute deterministic pacing (`computeCampaignBudgetPacing`).
- Call Groq via `groqClient` (`generateGroqInsight` or a structured variant) with `buildAnalysisPrompt`, parse with `parseAnalysisResult`.
- **Response:**
  ```
  {
    deterministic: { dailyBudget, action },
    ai: { proposedDailyBudget, rationale, confidence, riskFlags } | null,
    dataFreshness: { syncedAt, refreshed, refreshError? },
    modelId
  }
  ```
  `ai: null` whenever the model errored or output was unparseable (never blocks the operator).

**C3. UI — `app/components/social/SpendCampaignHistorySlideover.vue`**
- In the **Current recommendation** section: an **"Analyze with AI"** button + a small **"Refresh from platform"** toggle (off by default).
- On click → loading state → render a **comparison card**: Deterministic `$X/day` vs AI `$Y/day`, the AI rationale, a confidence badge, risk-flag chips, and a "synced Nh ago" freshness line (with a refreshed/failed indicator).
- A segmented control (Deterministic | AI) lets the human pick the number to approve; defaults to AI when present, else deterministic.
- **"Approve this adjustment"** → POST the existing `plan` endpoint with the chosen `recommendedDailyBudget` and `metadata.source = 'ai_analysis'`, carrying `{ aiProposedDaily, deterministicDaily, chosenSource, rationale, confidence, riskFlags, modelId, dataFreshness }`; then approve it (existing `approve` endpoint), so the row lands `approved`.
- The already-shipped admin-only **"Apply to Meta/Google"** button performs the guard-railed live write. No change to that path.

### Data Flow

click Analyze → [optional single-campaign refresh] → deterministic pacing + Groq reasoning → comparison card → human picks # → **Approve this adjustment** (plan+approve, audited, `source: ai_analysis`) → admin **Apply** (guardrails → write → read-back → audit) .

### Error Handling / Fail-safe

- Groq failure or bad output → `ai: null`, operator still sees the deterministic number (parity with `pacing-review.get`'s try/catch around the AI summary).
- Refresh failure → synced data + `refreshError` surfaced; never blocks analysis.
- The money-safety envelope is unchanged: nothing here writes to a platform. All live writes go through the existing admin Apply + guardrail engine.

### Testing

- **Unit (`spendAiAnalysis.test.ts`):** prompt includes the key signals; tolerant parse of well-formed, malformed, and empty model output; clamping of an absurd number; fail-safe `{ ok: false }` path; confidence/riskFlags coercion.
- **Endpoint pure-orchestrator test:** deterministic-present + AI-present merge; AI-failure → `ai: null` fallback; refresh-error → freshness flagged. Groq + DB mocked.
- No live platform calls in tests.

## Out of Scope (YAGNI / later)

- Auto-applying AI recommendations (autonomous mode) — explicitly human-in-the-loop "for now"; the structure leaves room to add it later behind a flag.
- Multi-ad-set ABO proportional split (already Phase 1.5 of budget-write).
- Caching per-campaign AI results — analysis is on-demand; revisit only if cost/latency warrants.
- Marketing-page sync — deferred to go-live, consistent with the budget-write feature.

## File Touch List

- `server/utils/spendAiAnalysis.ts` — new (pure).
- `test/server/utils/spendAiAnalysis.test.ts` — new.
- `server/api/agency/social/spend/[id]/ai-analysis.post.ts` — new.
- `test/server/api/socialSpendAiAnalysisEndpoint.test.ts` — new (pure orchestrator).
- `app/components/social/SpendCampaignHistorySlideover.vue` — modify (analyze button, comparison card, approve-adjustment wiring).
- Possible small reuse/extension of `server/utils/onDemandSync.ts` for the single-campaign refresh path.
