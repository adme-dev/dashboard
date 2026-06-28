# Structured Per-Channel Job Budget Model — Design Spec

- **Date:** 2026-06-28
- **Status:** Draft design (grounds the budget portion of brief→job P2)
- **Motivation:** Eliminate the briefing/budget miscommunication shown in the Geelong Kia conquest Slack thread.

## The problem, grounded in real data

Live Monday job **"Geelong Kia Conquest Google SEM"** (board 13392458, pulse 11922482657), fields as stored today:

| Field | Value | Problem |
|---|---|---|
| Campaign Type | `G_Search` (SEM) | **Stale & contradicts plan** — team moved to PMax + conquesting, no SEM. One slot, no split. |
| Client Budget | `600` (bare number) | **No period** — monthly? total? lifetime? This *is* Craig's "$600 vs $700 lifetime vs $1100". |
| Status | `Awaiting Client` | **Running?** Unanswerable. |
| (name) | "…Google SEM" | Reinforces the stale SEM truth. |
| Digital Budget / Design Budget | `30 Minutes` / `45 Minutes` | The word **"budget"** overloaded — these are time estimates, not money. |
| budget history | — | $500→$600, SEM→PMax recorded **nowhere** ("remember?"). |

Five distinct failure modes: (1) budget period undefined, (2) channel allocation invisible + single stale slot, (3) running-state ambiguous, (4) no change history, (5) "budget" means three things.

## Proposed model

A job's budget is **not a number** — it's a set of **allocations**, each explicitly typed:

```
JobBudgetAllocation {
  campaignType   // from the existing taxonomy: G_Search | G_PMaxInventory | M_AIA_Traffic | M_AIA_Leads | M_Leads | Brand | Conquesting | ...
  platform       // Google | Meta | TikTok | Spotify
  amount         // money
  period         // 'monthly' | 'total'      ← kills the $600-vs-$700-lifetime confusion
  month          // YYYY-MM, required when period='monthly'
  state          // 'active' | 'paused'      ← kills "are we running it?"
}
```

- **Total budget = sum of allocations** for the period — never a free-standing number that can disagree with its parts.
- **"No SEM" = the absence of a `G_Search` allocation** — a visible fact, not a Slack clarification. The Geelong Kia job would read: `{Conquesting/G_PMaxInventory, $X, monthly, active}` + `{Conquesting/SEM, $Y, monthly, active}`, **no Brand allocation** — exactly what Alicia described, legible at a glance.
- **`state` per allocation** ties to the spend/pacing layer (which already tracks live campaigns) → "running?" is answerable.
- **Change log** `JobBudgetChange { allocationRef, field, oldValue, newValue, by, at, reason }` — every $500→$600 / SEM→PMax move is recorded with who + why.
- **Naming hygiene:** "budget" = money only; rename the time-estimate columns ("Digital Budget"→"Digital Effort", etc.). One word, one meaning.

## Where it lives (reuses existing work)

- **Brief template (intake):** the brief captures the allocation at request time — this is the concrete payload for brief→job **P2** ("carry brief data into the job"), built on the **`briefCampaignType`** taxonomy already shipped. The C5 gatekeeper can require a valid allocation that sums correctly.
- **Budget tracker (manage/override):** the **accounts-manager-owned** surface (`app/pages/cashflow`, `agency/budget-health.vue`) is where allocations are edited/overridden and the change log is written — matching the confirmed operating model (accounts manager owns budget/deadline; AI proposes, human confirms).
- **Monday sync:** the allocation set projects back to the job (replacing the single `Client Budget` number + stale `Campaign Type`).
- **AI:** with this structure, the assistant answers Craig directly — *"Geelong Kia conquest, Jun 2026: $600 monthly — PMax $X + conquesting SEM $Y, no brand; active."* — instead of Alicia reconstructing it from memory.

## Data model sketch

- `job_budget_allocations` (job_id/brief_id, campaign_type, platform, amount, period, month, state, created_by, timestamps).
- `job_budget_changes` (allocation_id, field, old_value, new_value, changed_by, changed_at, reason).
- A computed `total` view per (job, period, month). No bare budget column as source of truth.

## Scope & phasing

This is the **budget portion of brief→job P2** made concrete. Sequence: (1) data model + allocation capture on the brief template; (2) budget-tracker edit + change log (accounts-manager surface); (3) Monday projection; (4) AI answer + pacing `state` wiring. Deadline (the other P2 half) follows the same surface-to-accounts-manager pattern.

## Open questions

1. Allocation granularity — per campaign-type only, or also per *ad set* (e.g. conquesting vs brand within a campaign type)? The thread implies campaign-type + a brand/conquesting *intent* split — likely `campaignType × intent`.
2. Monthly vs total: do clients ever set a true lifetime cap, or is everything monthly with a campaign window? (Determines whether `period:'total'` is common or rare.)
3. Source of truth during transition: dashboard-owned with Monday as a projection, or keep Monday authoritative until cutover?
