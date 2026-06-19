# Spec: Media Buyer Skill-Pack (Phase 2 — first vertical slice)

**Status:** Design — implementation-ready (code sketches grounded in real patterns)
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md) §7
**Depends on:** [Phase 0 plan](./ai-copilot-phase-0-plan.md) (WS-B executor registry, WS-C audit ledger)
**Created:** 2026-06-19
**Flags:** `AI_TOOLS_ENABLED` (existing), plus the existing budget-write flags on `feat/budget-write-execution`

---

## 1. Why Media Buyer first

It's the highest-readiness vertical: the media buyer already has a **live read tool** (`get_adspend_pacing`, FINANCE-gated) and — critically — the **write path already exists**. `feat/budget-write-execution` (built, reviewed, migs 177/178 applied to prod, 24+59 tests green, NOT merged, flag-gated off) applies AI pacing recommendations to live Meta/Google budgets. This slice **wraps that engine as a co-pilot tool** rather than building new execution. We prove the whole "advise → propose → confirm → execute live" loop end-to-end on the one department where the dangerous part is already battle-tested.

> ⚠️ This slice depends on the Phase 0 **executor registry** (WS-B). Until `confirm-action.post.ts` is tool-agnostic, no second write tool can be confirmed. Build Phase 0 WS-B first.

## 2. What the Media Buyer co-pilot does

**Persona:** rename/extend the existing `marketing` persona into a `media_buyer` skill-pack (personas are pure config in `server/utils/ai/personas.ts`).

**Reads (exist today):** `get_adspend_pacing`, `get_social_performance`, `get_project_status`, `search_knowledge`.

**Reads (net-new, thin wrappers over existing endpoints):**
- `get_campaign_breakdown` — over `GET /api/agency/analytics/campaigns` / `analytics/breakdowns` (campaign/adset spend, ROAS, CPC).
- `get_budget_health` — over `GET /api/agency/budget-health` (the budget-health tab data the model can read).

**Writes (propose → confirm → execute):**
- `propose_budget_change` — wraps the `feat/budget-write-execution` apply-chain. **High-risk (`rich_confirm`)** — changes live ad-platform budgets.
- `propose_budget_alert` — over `POST /api/agency/budget-alerts`. Low-risk (`confirm`).
- `propose_schedule_post` — over `POST /api/agency/social/publishing/schedule`. Low-risk (`confirm`).

## 3. Persona config (drop-in)

```ts
// server/utils/ai/personas.ts — add to PERSONAS
media_buyer: {
  key: 'media_buyer',
  label: 'Media Buyer',
  description: 'Ad-spend pacing, campaign performance, budgets and scheduling.',
  instructionsPreamble:
    "You are the agency's Media Buyer assistant. Focus on paid delivery — pacing, ROAS/CPC by campaign, "
    + "budget health, and scheduling. Lead with the numbers and the action. When proposing a budget change, "
    + "always state the current vs proposed daily budget, the % change, the campaign, and the expected pacing "
    + "effect, and make clear it will only apply after the user confirms. Never imply a change is already live.",
  toolAllowlist: [
    'get_adspend_pacing', 'get_campaign_breakdown', 'get_budget_health', 'get_social_performance',
    'get_project_status', 'propose_budget_change', 'propose_budget_alert', 'propose_schedule_post',
    ...COMMON,  // search_knowledge, create_task
  ],
},
```

Add a **role→default-persona** map so a `media_buyer` user lands on this skill-pack automatically (today personas are user-picked; the co-pilot vision is role-defaulted):

```ts
// new: server/utils/ai/rolePersona.ts
export const ROLE_DEFAULT_PERSONA: Record<string, string> = {
  media_buyer: 'media_buyer', finance: 'finance', accounts: 'finance',
  sales: 'sales', account_manager: 'account', creative: 'creative', producer: 'account',
}
// aiChatEngine: persona = explicitUserChoice ?? ROLE_DEFAULT_PERSONA[user.role] ?? 'general'
```

## 4. Read tool sketch (follows `adspend.ts` exactly)

```ts
// server/utils/ai/tools/campaignBreakdown.ts
const params = z.object({
  clientName: z.string().optional(),
  platform: z.enum(['meta', 'google']).optional(),
  sortBy: z.enum(['spend', 'roas', 'cpc']).default('spend'),
})
export const campaignBreakdownTool: AiTool<Args> = {
  name: 'get_campaign_breakdown',
  description: 'Per-campaign spend, ROAS and CPC for a client across Meta/Google for the current period. '
    + 'Use for "which campaigns are wasting spend", "best/worst ROAS", "CPC by campaign". '
    + 'Do NOT use for whole-account pacing (use get_adspend_pacing) or cash (use get_finance_snapshot). '
    + 'Returns a compact list capped at 20 with a `more` count.',
  parameters: params,
  requiredPermission: 'MEDIA_BUYING',   // note: broader than FINANCE — media buyers get this
  handler: (a, c) => getCampaignBreakdown(a, c),
}
```

Injected-deps + `$fetch` with `ctx.event.headers` for tenant/session, `capWithMore(..., 20)`, `ok`/`fail` — identical to `adspend.ts`.

> **Permission note:** `get_adspend_pacing` is gated `FINANCE`, which *excludes* `media_buyer` (per `permissions.ts`, FINANCE = owner/admin/lead/PM/finance/accounts). The new media-buyer read tools must gate on `MEDIA_BUYING` (= owner/admin/lead/PM/media_buyer/account_manager) so the actual media buyer can use their own assistant. Decide whether to also widen `get_adspend_pacing` to `MEDIA_BUYING` or keep a media-buyer-scoped variant. **Recommendation: add `MEDIA_BUYING` read variants; leave FINANCE tools as-is.**

## 5. Write tool sketch — the high-risk one (follows `createTask.ts` Option B)

```ts
// server/utils/ai/tools/proposeBudgetChange.ts
const params = z.object({
  clientName: z.string(),
  campaignName: z.string(),
  platform: z.enum(['meta', 'google']),
  newDailyBudget: z.number().positive(),
  reason: z.string().optional(),
})
export async function proposeBudgetChange(args, ctx, deps = defaultDeps): Promise<ToolResult> {
  if (!roleHasPermission(ctx.userRole, 'MEDIA_BUYING')) return fail('You do not have permission to change budgets.')
  if (!ctx.conversationId) return fail('Cannot prepare a budget change outside a conversation.')
  // resolve campaign → unambiguous id (exact-match-wins, mirrors pickByExactName)
  const matches = await deps.resolveCampaign(args, ctx)
  if (matches.length !== 1) return ok({ disambiguation: { field: 'campaignName', options: matches } })
  const c = matches[0]!
  const resolved = {
    campaignId: c.id, campaignName: c.name, platform: args.platform,
    currentDailyBudget: c.dailyBudget, newDailyBudget: args.newDailyBudget,
    pctChange: Math.round(((args.newDailyBudget - c.dailyBudget) / c.dailyBudget) * 100),
    clientName: args.clientName, reason: args.reason ?? null,
  }
  const proposalId = await deps.propose(ctx, resolved)   // → ai_pending_actions, tool_name='propose_budget_change'
  return ok({ proposalId, resolved })
}
export const proposeBudgetChangeTool: AiTool<Args> = {
  name: 'propose_budget_change',
  description: 'PROPOSE changing a campaign\'s daily budget on Meta or Google. This does NOT change anything — '
    + 'it prepares a proposal the user must confirm with a button. Always surface current vs proposed budget and % change. '
    + 'If the result has a `disambiguation`, the proposal was NOT prepared — ask the user to pick the exact campaign. '
    + 'Only say a change is ready when the result has a `proposalId`. Never claim the budget was changed.',
  parameters: params,
  mutates: true,
  riskTier: 'rich_confirm',     // NEW (Phase 0 WS-B/C): high-risk → richer confirm + counter-model check
  handler: (a, c) => proposeBudgetChange(a, c),
}
```

## 6. Executor (Phase 0 WS-B registry) — where it actually executes

```ts
// server/utils/ai/executors/proposeBudgetChange.ts
export const budgetChangeExecutor: ActionExecutor = {
  label: 'budget change',
  riskTier: 'rich_confirm',
  async execute(payload, ctx) {
    // Reuse the feat/budget-write-execution apply-chain (the admin Apply endpoint), NOT a new writer.
    const r = await $fetch('/api/agency/social/budget/apply', {   // the existing budget-write endpoint
      method: 'POST',
      body: { campaignId: payload.campaignId, platform: payload.platform, newDailyBudget: payload.newDailyBudget },
      headers: ctx.event.headers as any,
    })
    return { resultRef: r.changeId, summary:
      `✅ Set ${payload.campaignName} daily budget to ${payload.newDailyBudget} (${payload.pctChange >= 0 ? '+' : ''}${payload.pctChange}%).` }
  },
}
// register in executors/index.ts: { create_task, propose_budget_change, propose_budget_alert, propose_schedule_post }
```

The generic `confirm-action.post.ts` (Phase 0 WS-B) looks this up by `tool_name`, executes, writes an `ai_action_audit` row (WS-C) with `risk_tier='rich_confirm'`, and posts `summary` to the thread.

## 7. Rich-confirm + counter-model (high-risk only)

Per [Strata HITL 2026](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/) and [CIO guardrails blueprint](https://www.cio.com/article/4094586/guardrails-and-governance-a-cios-blueprint-for-responsible-generative-and-agentic-ai.html), a live-budget change is exactly the class that warrants more than "Approve?":

- **Rich confirm card** shows: campaign, current → proposed, % change, expected pacing effect, and a one-line rollback note ("revert to {current} anytime").
- **Counter-model sanity check** (cheap `gpt-oss-20b`): before the card renders, a second pass asks "is this budget change sane given current pacing?" and flags obvious mistakes (e.g. a 10× increase, or raising an already-overpacing campaign). Advisory, surfaced on the card — never auto-blocks, never auto-approves.
- **Hard rule:** keep the budget-write flags off until owner sign-off; this slice ships **dormant** like its parent feature.

## 8. Tasks

| # | Task | Files | Tests |
|---|---|---|---|
| 1 | `media_buyer` persona + role-default map | `personas.ts`, `rolePersona.ts`, `aiChatEngine.ts` | persona-name assertion, default-map unit |
| 2 | `get_campaign_breakdown` read tool (MEDIA_BUYING) | `tools/campaignBreakdown.ts`, `tools/index.ts` | handler + filter/cap |
| 3 | `get_budget_health` read tool | `tools/budgetHealth.ts` | handler |
| 4 | `propose_budget_change` (Option B, rich_confirm) | `tools/proposeBudgetChange.ts` | propose/disambig/permission |
| 5 | `propose_budget_alert` + `propose_schedule_post` | `tools/*.ts` | propose/permission |
| 6 | Executors for all three writes (reuse budget-write apply-chain) | `executors/*.ts` | execute + audit-row |
| 7 | Counter-model sanity check on rich_confirm | `executors/sanityCheck.ts` | flag-on-bad-change unit |
| 8 | Rich confirm card UI (current→proposed, %, rollback) | `app/components/ai/*` | component |
| 9 | Marketing sync at go-live | features pages, MarketingNav | — |

## 9. Acceptance criteria

- [ ] A `media_buyer` user auto-lands on the Media Buyer skill-pack; sees only MEDIA_BUYING-permitted tools.
- [ ] "Which Acme campaigns are overpacing?" → `get_adspend_pacing`/`get_campaign_breakdown` answers with numbers.
- [ ] "Cut Acme Retargeting to $40/day" → `propose_budget_change` returns a proposal (or disambiguation), **never** changes anything directly.
- [ ] Confirm executes via the budget-write apply-chain, writes an audit row, posts a summary; second confirm is idempotent.
- [ ] Counter-model flags an obviously-wrong change on the card.
- [ ] All flag-gated dormant; no live budget changes without owner sign-off.
- [ ] Full suite green, zero new type errors, `/code-review high` clean.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Live budget write with wrong amount | Option B propose→confirm, rich card, counter-model, reuse battle-tested apply-chain, flag-off |
| `get_adspend_pacing` FINANCE gate blocks real media buyers | Add MEDIA_BUYING read variants (§4 note) |
| Confirm endpoint not yet generic | Hard dependency on Phase 0 WS-B — sequence it first |
| Campaign name ambiguity → wrong campaign | `pickByExactName`-style exact-match-wins + disambiguation (proven in createTask) |

---

### Sources
- [Human-in-the-Loop 2026 (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/) · [Guardrails & Governance — CIO blueprint](https://www.cio.com/article/4094586/guardrails-and-governance-a-cios-blueprint-for-responsible-generative-and-agentic-ai.html) · [Adobe Marketing Agent for M365 Copilot](https://business.adobe.com/blog/introducing-adobe-marketing-agent-microsoft-365-copilot)
