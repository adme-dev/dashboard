# Design — AI Assistant Tool-Calling, Slice 2: Margin & Forecasting Tools

**Date:** 2026-06-07
**Status:** Approved (brainstorm) — pending implementation plan
**Extends:** `2026-06-07-ai-tool-calling-design.md` (Slice 1 + 1.5, shipped & live). Realises §15 "Candidate future agent tools" items 1, 3, 4, 6.

---

## 1. Problem & Vision

Slice 1 + 1.5 shipped a gated tool-calling loop with 9 read tools + `create_task`, named personas, RBAC, spotlighting, audit, and cost tracking — all live in prod behind `AI_TOOLS_ENABLED=true`. The assistant can answer cashflow, ad-spend, task, project, anomaly, client, knowledge, social, and brief questions, and propose a task.

It **cannot** yet answer the questions an agency principal asks most: *which clients actually make us money, which retainers are burning too fast, where are we over-servicing, and where will revenue land?* The data to answer all four already exists — the agency ships a deep `get-out` financial engine (~40 endpoints: AGI, delivery margin, per-client revenue, month-end forecast, pipeline coverage, recurring/retainer mix), plus Postgres-native retainers, timesheets, rate cards, and a CRM pipeline.

This slice **exposes those existing engines as four read-only agent tools**. It is not new analytics — it is wiring trusted, already-built computations into the conversational front door (text, widget, and voice all inherit them via `processUserMessage`).

## 2. Scope

**In scope (Slice 2):**
- **4 read-only tools** on the existing Slice-1 loop:
  - `get_client_profitability` — per-client AGI + delivery margin (+ revenue, concentration, churn risk).
  - `monitor_retainer_burn` — retainer cap vs labor consumed, pace/projection.
  - `flag_over_servicing` — delivered labor value vs signed-scope baseline.
  - `forecast_revenue` — month-end landing + quarterly pipeline coverage.
- All **FINANCE**-gated, **agency-internal only**, joined to the **Finance persona** allowlist.
- Unit + loop tests, promptfoo tool-selection cases, marketing-page sync.

**Out of scope (deferred):**
- **Proactive / scheduled alerting** for retainer-burn or over-servicing (cron + anomaly/notification infra + companion Worker). Slice 2 is **on-demand read only**; proactive agents remain in the deferred multi-agent / Workflow Oracle tier (Slice-1 spec §15).
- Any **write** tool (`suggest_allocation`, `draft_sow_from_brief`, `route_for_approval`).
- Tools gated by missing features: capacity planning, SOW/estimates, DAM.
- **Client-portal AI exposure** of these tools (explicit non-goal — see §7).
- Streaming, durable per-user memory.

## 3. Key Decisions

| Decision | Choice | Basis |
|---|---|---|
| Slice size | **All 4 feasible read tools** (margin cluster + forecast) | Matches Slice-1 batch size; coherent "agency margin & forecasting" theme; all data-backed today. |
| Build approach | **Approach A** — thin handlers over existing engines; reuse trusted definitions, do **not** rebuild analytics | DRY/YAGNI; the get-out engine is the agency's source of financial truth. |
| Proactive vs on-demand | **On-demand read only** | Proactive scheduled alerting is a larger build that overlaps the deferred multi-agent tier. |
| `get_client_profitability` headline | **Margin is the headline** (AGI + delivery margin), extract a per-client query from `margin.get.ts` if not already exposed | Margin answers the #1 agency question; revenue alone is weaker. |
| `flag_over_servicing` baseline | **Retainer cap = v1 scope baseline** | Retainers store a clean numeric cap; free-text scope is unreliable. |
| Wiring per data source | **Hybrid**: Xero-mediated data → injectable internal-route-fetch dep; Postgres data → injectable direct-query dep | Mirrors prod-verified Slice-1 reality (`finance.ts` route-fetch; `tasks.ts` direct query). |
| Migration | **None** | All four read existing tables/engines. |

## 4. Architecture

### Wiring pattern (the core decision)

Every handler follows the Slice-1 shape:

```ts
export async function fn(args: Args, ctx: ToolContext, deps = defaultDeps): Promise<ToolResult>
```

plus an `AiTool` registry entry. How `defaultDeps` reaches data depends on the source of truth:

| Source | Wiring | Precedent (shipped) |
|---|---|---|
| **Xero-mediated** (P&L, AGI, margin, forecast, pipeline) | injectable dep → internal route fetch, `ctx.event.headers` forwarded (Xero needs the session token + tenant resolution that lives in the endpoint) | `server/utils/ai/tools/finance.ts` (prod-verified) |
| **Postgres** (retainers, timesheets, rate cards, CRM pipeline) | injectable dep → **direct query**, tenant/org-scoped, no `$fetch` | `server/utils/ai/tools/tasks.ts`, `projects.ts` |

Either way the handler is pure-testable: unit tests inject mock deps; **no live LLM and no live Xero in unit tests**.

> ⚠️ **Build-time footgun:** `finance.ts` imports `$fetch` from `ofetch` with relative URLs and works in prod, but PR #129 found raw-ofetch relative URLs fail on CF Workers in the *confirm-action* path. Slice-2 Xero-mediated deps will prefer the **Nitro global `$fetch`** (auto-imported) over `import { $fetch } from 'ofetch'`, and a build-time check must confirm each fires on the deployed Worker.

### Component map

**New**
- `server/utils/ai/tools/profitability.ts` — `get_client_profitability` handler + deps + `AiTool`.
- `server/utils/ai/tools/retainerBurn.ts` — `monitor_retainer_burn`.
- `server/utils/ai/tools/overServicing.ts` — `flag_over_servicing`.
- `server/utils/ai/tools/revenueForecast.ts` — `forecast_revenue`.
- Test files under `test/ai/tools/` for each.

**Modified**
- `server/utils/ai/tools/index.ts` — register the 4 tools.
- `server/utils/ai/personas.ts` — add the 4 to the Finance persona allowlist.
- (possibly) `server/api/xero/get-out/margin.get.ts` — extract/expose a per-client margin breakdown if not already present (shared util both the endpoint and the tool import).
- Marketing pages — `app/pages/features/index.vue`, the AI `features/[slug].vue` entry, `app/components/MarketingNav.vue` (if warranted).

**Unchanged (inherit tools for free)**
- `toolLoop.ts`, `toolRegistry.ts`, `gate.ts`, `spotlight.ts`, `voice.post.ts`, the chat widget, `messages.post.ts`.

### Data flow

Unchanged from Slice 1: gate → tool loop → RBAC-filtered tools → `generateText({ stopWhen: isStepCount(5) })` → handler (validate args → re-check perm → inject scope → run) → compact result → final text. The 4 new tools simply appear in the FINANCE-filtered toolset.

## 5. Tool Registry & Specs

Shared conventions: `requiredPermission: 'FINANCE'`; `returnsUntrusted: false` (numbers + known entity names only); output capped ~10 rows with a `more` count and **no raw DB rows**; **omitting `clientName` → portfolio view**, naming one → **deep-dive**. Names resolved by fuzzy match → disambiguation list on multiple, clear "no match" on none (mirrors Slice-1 `create_task`).

### 5.1 `get_client_profitability` — Xero-fetch deps
- **Args:** `{ clientName?: string, period?: 'mtd' | 'ytd' }` (default `mtd`).
- **Source:** `get-out/margin` (AGI + delivery margin, per-client labor-cost join) + `get-out/clients` (this-month revenue, churn risk) + `get-out/top-clients` (YTD revenue, concentration %).
- **Definitions (reused from `margin.get.ts`):** AGI = Revenue − pass-through costs (configured `passthrough_account_codes`); Delivery margin = (AGI − delivery labor cost) / AGI.
- **Output (deep-dive):** `{ client, period, revenue, agi, deliveryMarginPct, laborCost, concentrationPct, churnRisk }`.
- **Output (portfolio):** `{ period, topByMargin: [{ client, revenue, agi, marginPct } …≤10], bottomByMargin: […], agencyConcentration: { top5Pct, top10Pct }, more }`.
- **Plan-time:** confirm `margin.get.ts` exposes a per-client breakdown, or extract a per-client variant of its query into a shared util.

### 5.2 `monitor_retainer_burn` — Postgres-direct deps
- **Args:** `{ clientName?: string, period?: 'mtd' }`.
- **Source:** `agency/retainers` (cap + cadence) + timesheets (labor consumed this period) [+ `get-out/recurring-mix` for billed recurring, optional].
- **Output (deep-dive):** `{ client, retainerCap, consumed, burnPct, pace: 'under' | 'on' | 'over', projectedEndOfPeriod, hoursLogged }`.
- **Output (portfolio):** `{ period, atRisk: [{ client, burnPct, pace } …], summary: { count, overCount }, more }`.
- **Degradation:** no active retainer for X → `ok` with a "no active retainer on record" note (not an error).
- **Plan-time:** confirm retainer cap units ($ vs hours) and the consumption measure (time entries × rate-card cost).

### 5.3 `flag_over_servicing` — Postgres-direct deps
- **Args:** `{ clientName?: string, thresholdPct?: number }` (default `100`).
- **Source:** timesheets (delivered labor value) + **retainer cap (v1 scope baseline)** + rate cards (cost rate). The **labor lens**, complementary to 5.1's financial lens.
- **Output (deep-dive):** `{ client, scopeValue, deliveredValue, overByPct, overByAmount, topProjects: [{ project, deliveredValue } …] }`.
- **Output (portfolio):** `{ threshold, flagged: [{ client, overByPct } …≤10 desc], more }`.
- **Degradation:** no retainer cap on record → "no scope baseline on record for X to compare against".

### 5.4 `forecast_revenue` — Xero-fetch deps
- **Args:** `{ horizon?: 'month' | 'quarter' }` (default `month`).
- **Source:** `get-out/forecast` (month-end landing: invoiced + AR collectible + recurring + weighted quotes − leakage) for `month`; `get-out/pipeline-coverage` (open pipeline ÷ quarterly target + coverage band) for `quarter`.
- **Output (month):** `{ horizon: 'month', invoiced, arCollectible, recurring, quotesProbable, leakage, projected, vsTarget }`.
- **Output (quarter):** `{ horizon: 'quarter', coverageWeighted, coverageFace, band, quarterlyTarget, pipelineOpen }`.
- **Degradation:** Xero disconnected → `fail('…forecast unavailable; Xero may be disconnected')`.

## 6. RBAC — defense in depth

1. **Pre-send filtering** — all 4 declare `requiredPermission: 'FINANCE'`; `filterToolsForUser` drops them for roles without FINANCE (creative, media_buyer, account_manager, sales). The model never sees them.
2. **Handler-time re-check** — `roleHasPermission(ctx.userRole, 'FINANCE')` re-verified at execute time (the registry's `toSdkTools` already does this); even a stale/duplicated call is gated.
3. **Tenant/org scoping** — Xero engines resolve the selected tenant from session; Postgres queries filter by org/tenant. These are whole-org finance tools (the caller is FINANCE-permissioned agency staff), not per-end-user row-scoped.
4. **Agency-internal only (explicit non-goal)** — these tools are **never** registered on the client-portal AI surface. A client must never see another client's (or the agency's) margin. Portal and agency loops use separate tool sets.

## 7. Untrusted-data & loop safety

- **`returnsUntrusted: false`** for all four — outputs are numbers and known entity (client/project) names; **no free-text bodies enter context** → no spotlighting required.
- **No new write path** → the Rule-of-Two / lethal-trifecta posture is **unchanged** from Slice 1. (No tool added here can trigger an unreviewed state change or external comms.)
- **Voice** inherits the tools automatically (all surfaces call `processUserMessage`); read-only, safe to speak.

## 8. Loop Safety & Error Handling

- **Handlers never throw to the loop** — they return `{ ok: false, error }` natural-language results so the model recovers (per Slice-1 §10).
- **Xero disconnected / cache empty** → graceful `fail()` with a plain reason (mirrors `finance.ts`).
- **Stale-cache caveat** — the get-out invoice-line cache is **manual-backfill (no nightly sync Worker yet)**, so numbers can lag. Tools surface a freshness note ("as of last sync") where the engine exposes `synced_at`. *Plan-time:* wire freshness if available; this is a known data-currency limitation, not a Slice-2 deliverable.
- **No-data** (no retainer, no scope) → `ok` with an explanatory note, never an error (so the model answers helpfully instead of retrying).
- Step cap (`isStepCount(5)`), wall-clock deadline, and per-turn cost budget are unchanged (loop-level, Slice 1).

## 9. Data Model

**No migration.** All four tools read existing tables/engines. Slice-1 migrations 171 (`tool_calls`) and 172 (cost columns) already cover the audit/cost surface; the new tool calls are captured by the existing `ai_messages.tool_calls` trace automatically.

## 10. Testing & Evals

- **Handlers (unit, injected mock deps):** portfolio vs deep-dive shapes; compact cap + `more`; FINANCE re-check denies a non-finance role; degradation/no-data path; name disambiguation (0 / 1 / many matches); tenant/org scoping.
- **Loop (unit, mock AI SDK model):** "which clients are least profitable" → portfolio `get_client_profitability`; a chit-chat **"should NOT call a tool"** case stays on the fast path; multi-tool turn (e.g. profitability + retainer-burn) composes.
- **RBAC filtering (unit):** FINANCE role → 4 tools present; creative/media role → absent; handler re-check blocks a forced call.
- **promptfoo:** add tool-selection cases (incl. negatives — don't fire a finance tool for a non-finance question) for the 4. The existing prompt-injection suite is unchanged (no new untrusted surface).
- **Typecheck:** `NODE_OPTIONS=--max-old-space-size=16384 pnpm exec nuxt typecheck`; target **0 new errors** over the ~60 + 2-known-`aiChatEngine` GroqModel baseline. No live LLM in unit tests.

## 11. Marketing Sync (CLAUDE.md mandate)

Update the public AI feature surface truthfully (margin / retainer-burn / over-servicing / forecast Q&A), following PR #125's precedent:
- `app/pages/features/index.vue` — extend the AI feature entry.
- `app/pages/features/[slug].vue` — the AI assistant detail entry (capabilities list).
- `app/components/MarketingNav.vue` — only if the capability warrants a nav change.

## 12. Rollout

1. **Branch from `origin/main`** (not the diverged local `main`) in an **isolated git worktree** — the current working tree holds untouchable social-publishing WIP.
2. Registry + 4 handlers + unit tests.
3. Finance-persona allowlist + loop/RBAC tests.
4. Marketing-page sync.
5. promptfoo tool-selection cases.
6. **UAT before deploy** (Kimi WebBridge on Paul's authed prod session) — `AI_TOOLS_ENABLED` is already on and build-baked, so these tools **go live on the next deploy**; UAT must precede it.
7. Deploy only from clean `.worktrees/deploy-prod` via `AI_TOOLS_ENABLED=true pnpm deploy:production`; push via the **adme-dev** gh account.

**Divergence reconciliation (separate from the code branch):** local `main` carries 9 local-only `docs(ai)` commits (incl. this spec) and is behind origin by 13. The docs commits should be pushed/rebased onto origin so the specs land upstream — **not** folded into the Slice-2 code branch.

## 13. Open Questions / Plan-time Items

1. Does `margin.get.ts` already return a per-client breakdown, or must we extract a per-client variant of its query? (Headline-margin depends on this.)
2. Retainer cap units ($ vs hours) and the canonical consumption measure (time entries × rate-card cost vs billed fee drawdown).
3. Whether the get-out engines expose a `synced_at`/freshness signal to surface the stale-cache caveat.
4. `forecast_revenue` quarterly target source — confirm it reuses `get-out/pipeline-coverage`'s configured monthly Get-Out × 3 rather than a separate target.

## 14. References

- Slice-1 design: `docs/superpowers/specs/2026-06-07-ai-tool-calling-design.md` (§6 registry shape, §7 RBAC, §8 propose-confirm-execute, §10 loop safety, §15 candidate roadmap).
- Shipped tools: `server/utils/ai/tools/*` (mirror `finance.ts` for Xero-fetch, `tasks.ts`/`projects.ts` for Postgres-direct).
- Engines: `server/api/xero/get-out/{margin,clients,top-clients,forecast,pipeline-coverage,recurring-mix}.get.ts`, `server/utils/agi.ts`, `server/api/agency/{retainers,rate-cards,time/timesheets}/*`, `server/api/agency/projects/profitability.get.ts`.
- Permissions: `server/utils/permissions.ts` (`FINANCE` group), personas: `server/utils/ai/personas.ts`.
