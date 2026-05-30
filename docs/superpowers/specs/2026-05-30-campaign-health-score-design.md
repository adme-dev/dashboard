# Campaign Health Score (client-target-aware) — Design

**Date:** 2026-05-30
**Status:** Approved — ready for implementation plan
**Inspiration:** breezeway.co (Meta Ads optimization tool) — its "BreezeScore" (per-campaign confidence/health number), color-coded kill/scale verdicts, and "BreezeBrain" (recommendations driven by *your* KPIs, not generic benchmarks). This adapts those ideas to our multi-client agency model.

## Problem

The analytics campaign table shows many raw metrics but no synthesized judgement. A media buyer reviewing dozens of campaigns across clients has to mentally combine cost-per-result, CTR, frequency, and quality rankings — against each client's *different* economics — to decide what to scale or cut. A "$25 cost-per-lead" is excellent for one client and a disaster for another, and nothing in the dashboard encodes that.

## Goal

Give agency staff a single, glanceable, **explainable** health signal per campaign — a 0–100 score, a color-coded verdict (**Scale / Hold / Cut / Insufficient data**), and the reasons — computed against **each client's own target KPIs**, surfaced as a sortable column in the agency analytics table.

**Audience:** internal only (agency staff) for v1. No client-portal presentation.

## Non-goals (deferred)

- Prescriptive action-list recommendations ("cut ad set X, scale Y").
- Wiring client targets into the anomaly-detection engine.
- Any client-portal display (verdicts can be blunt internally; a softened client version is a later decision).
- AI/LLM-generated scores — the score is a transparent deterministic formula (the existing Groq AI summary remains as optional narrative).

## Design

### 1. Data model

New table **`client_kpi_targets`** (migration `120`):

```sql
CREATE TABLE IF NOT EXISTS client_kpi_targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  result_type VARCHAR(40) NOT NULL,            -- matches media_spend.result_type, e.g. 'Leads (Form)'
  target_cost_per_result NUMERIC(10,2) NOT NULL,
  target_ctr NUMERIC(5,2),                      -- optional, percent
  max_frequency NUMERIC(5,2),                   -- optional, Meta
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (client_id, result_type)
);
CREATE INDEX IF NOT EXISTS idx_client_kpi_targets_client ON client_kpi_targets(client_id);
```

One row per client per result type. `target_cost_per_result` is required (the primary signal); CTR/frequency targets are optional secondary inputs.

### 2. Scoring engine — `server/utils/campaignHealth.ts` (pure, unit-tested)

```ts
export interface HealthInput {
  platform: string
  costPerResult: number | null
  resultCount: number          // conversions for the campaign in the period
  spend: number
  ctr: number | null           // percent
  frequency: number | null     // Meta
  qualityRanking?: string | null
  engagementRateRanking?: string | null
  conversionRateRanking?: string | null
  impressionShare?: number | null   // Google, percent
  target: { targetCostPerResult: number; targetCtr?: number | null; maxFrequency?: number | null } | null
}
export interface HealthResult {
  score: number | null         // 0–100, null when no target
  verdict: 'scale' | 'hold' | 'cut' | 'insufficient' | 'no-target'
  confidence: 'low' | 'med' | 'high'
  reasons: string[]            // human-readable drivers, strongest first
}
export function scoreCampaignHealth(input: HealthInput): HealthResult
```

**Algorithm (v1 weights — tunable constants at the top of the file):**

- **No target** → `{ score: null, verdict: 'no-target', reasons: ['No KPI target set for this result type'] }`. (Surfaces the gap so staff set targets.)
- **Confidence** from `resultCount`: `>= 30` high, `8–29` med, `< 8` low.
- **Hard cases first:**
  - `spend >= 3 × targetCostPerResult` AND `resultCount === 0` → `verdict: 'cut'`, score 10, reason "Spent $X with zero results". (Judgeable even at low volume.)
  - `confidence === 'low'` (and not the above) → `verdict: 'insufficient'`, score null-or-neutral, reason "Not enough results yet (<8)".
- **Otherwise compute score** from a 50 baseline:
  - **Efficiency** (primary), `ratio = costPerResult / targetCostPerResult`: `≤0.7 → +40`, `≤1.0 → +20`, `≤1.3 → 0`, `≤2.0 → −25`, `>2.0 → −40`. Reason e.g. "CPL $35 vs $25 target (+40%)".
  - **Engagement** (only if `targetCtr` set): CTR below target → up to −15; above → +5.
  - **Fatigue** (Meta, if frequency present): `>4.5 → −15`, `>3 → −10`, `≤2 → +5`. Reason "Frequency 4.2 — creative fatigue".
  - **Relevance**: Meta rankings — each `ABOVE_AVERAGE +5`, `BELOW_AVERAGE −5` (cap ±15). Google — `impressionShare` high `+`, low `−` (cap ±15).
  - Clamp to 0–100.
- **Verdict bands** (sufficient confidence): `score ≥ 70` AND efficiency non-negative → `scale`; `score ≤ 35` → `cut`; else `hold`. (`med` confidence may downgrade `scale`→`hold` — never upgrade.)
- **`reasons`**: the 2–3 strongest contributors, strongest first.

Tunable constants (thresholds/weights) live at the top of the module with comments so they can be adjusted without touching logic.

### 3. API — `server/api/agency/analytics/campaigns.get.ts`

- `LEFT JOIN client_kpi_targets t ON t.client_id = <campaign client_id> AND t.result_type = <campaign result_type>` (inside the existing CTE, or fetch targets per client and match in the map step — match the campaign's `result_type`).
- For each row, build `HealthInput` from already-selected fields (reach/cpr/rankings are present after the prior columns work) + the matched target, call `scoreCampaignHealth`, and return `health: HealthResult` on the campaign object.
- Add `health_score` to `ALLOWED_SORT` (sort by the computed score; rows with null score sort last).
- **Agency endpoint only** — the portal endpoint is unchanged (internal-only feature).

### 4. Display — `app/components/analytics/CampaignTable.vue`

- New **Health** column in `allColumns` (`sortable: true`, key `health`): a color-coded badge — green `scale`, amber `hold`, red `cut`, grey `insufficient`/`no-target` — showing the score number (or "–"/"Set target") and verdict label. A `UTooltip`/title shows `reasons`.
- Add `health` to the **Meta Ads view** preset and near the front of the column order.
- A small `healthColor(verdict)` + `healthLabel(verdict)` helper (pure, in `app/utils/`) — unit-tested.
- The expanded detail panel shows the full `reasons` list.

### 5. Settings UI — client KPI targets

- On the client edit/detail page (agency side), a "KPI Targets" section: a small editable table of `result_type → target cost-per-result (+ optional CTR / max frequency)` rows, with add/remove. Backed by CRUD endpoints:
  - `GET /api/agency/clients/[id]/kpi-targets`
  - `PUT /api/agency/clients/[id]/kpi-targets` (upsert the full set) — `requireRole` write-gated.
- Result-type options sourced from the distinct `result_type` values seen in that client's `media_spend` (so staff pick from what actually runs), plus free-entry.

## Testing

- **Unit (engine):** no-target → `no-target`; zero-results-high-spend → `cut`; <8 results → `insufficient`; efficient+healthy → `scale` with score ≥70; over-target+fatigued → `cut`; near-target → `hold`; confidence downgrade (med caps scale→hold); reasons ordering. Pure function, fully table-testable.
- **Unit (color/label helpers):** verdict → color/label mapping.
- **API:** campaigns response includes `health` with correct verdict for seeded targets; null target → `no-target`; `health_score` sort works.
- **Manual:** set a client's target, confirm the Health column colors and the tooltip reasons match; sort by Health.

## Edge cases

- Campaign `result_type` null (no synced result) → no target match → `no-target`.
- Multiple `media_spend` rows per campaign: use the same latest-row aggregation already in the CTE for cost-per-result/result-type.
- Target exists but `costPerResult` null while spend > 0 → treated by the zero-results hard case.
- Google campaigns (no frequency/rankings) → those inputs absent; efficiency + impression-share drive the score.
- Changing a target re-scores on next API read (no stored score; computed on the fly).

## File structure

- Create: `server/database/migrations/120-client-kpi-targets.sql`
- Create: `server/utils/campaignHealth.ts` + `test/server/utils/campaignHealth.test.ts`
- Create: `app/utils/campaignHealthFormat.ts` (color/label) + `test/utils/campaignHealthFormat.test.ts`
- Create: `server/api/agency/clients/[id]/kpi-targets.get.ts`, `kpi-targets.put.ts`
- Modify: `server/api/agency/analytics/campaigns.get.ts` (join targets, run engine, return `health`, sort key)
- Modify: `app/components/analytics/CampaignTable.vue` (Health column + detail reasons)
- Modify: `app/pages/agency/clients/[id].vue` (KPI Targets settings section). Endpoints follow the existing `clients/[id]/team.{get,post}` sub-resource pattern.
- Marketing sync per CLAUDE.md (Cross-Platform Analytics feature entry — mention campaign health scoring)
