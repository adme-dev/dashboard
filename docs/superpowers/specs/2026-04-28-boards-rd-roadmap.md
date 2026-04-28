# Boards R&D Roadmap

**Date:** 2026-04-28
**Status:** Roadmap (top-level). Each phase will get its own design doc when we brainstorm it.
**Owner:** Paul

## Purpose

Capture the full set of R&D ideas for the Boards feature in one place, sequenced into phases that compound. This document is intentionally **not** an implementation spec — it is the decomposition step. Each phase below will go through its own brainstorm → design → plan → execute cycle.

## Goals

- Make Boards feel intelligent (the system surfaces signal, not just stores rows)
- Tie Boards to the rest of the agency stack (clients, briefs, ad spend, Xero, EOM) so the board is the operational source of truth
- Raise the realtime / collab bar to 2026-expected levels
- Lay foundations early so later AI/analytics features aren't hacky

## Non-goals

- Replacing Monday.com import paths (we still have legacy `task_monday_column_values` reads — keep until migration debt is paid down separately)
- Mobile-first redesign (tracked elsewhere)
- Net-new pricing/tier work

## Current state (from 2026-04-28 audit)

- **Frontend:** `app/pages/agency/boards/[id].vue` (52KB), 5 views (table/kanban/timeline/calendar/gallery), 24 cell types, BoardContainer + cell registry pattern
- **Backend:** Nitro endpoints under `server/api/agency/boards/`; CRUD for board/columns/groups/items/views/automations/templates; IDE-prompt + chat-feed integrations
- **Realtime:** `BoardRoom` Durable Object with 200-event in-memory buffer, 5-min TTL; WS → SSE → polling fallback
- **Schema:** `custom_columns`, `task_column_values`, `board_groups`, `board_views`, `board_automations`, `task_linked_items`, `global_tags`; ~50 incremental migrations
- **Tests:** one file (`boardNotifications.test.ts`); virtually no E2E coverage
- **Gaps:** formula columns declared in ENUM but never wired; no per-user `last_seen_at`; no aggregate metrics; no instrumentation on BoardRoom

## The 15 R&D ideas

Each idea has: hook, agency-specific angle, and notes. Per-phase design docs will expand these.

### A. Agentic / AI-native

1. **AI PM Agent** — Cron-driven daily pass over active boards. Drafts triage messages ("3 overdue, here's a draft Slack to owners"), unassigned-task suggestions, brief-update propagation. Posts to Activity Hub.
2. **Natural-language board operator** — chat input that mutates boards via tool-using LLM. Examples: *"move all Q2 tasks tagged launch to In Review", "create a board from EOM template for client Acme"*. Single endpoint with structured tool schema.
3. **Voice quick-capture** — hotkey-triggered STT → AI parses intent → preview → confirm. Reuses existing Voice AI infrastructure.
4. **What-if simulator** — sandboxed copy of a board where you drag deadlines / reassign owners and see projected impact (overload, broken deps, downstream slips). Commit or discard.
5. **Smart triage inbox** — global view across all boards of *what changed in the last 24h that likely needs you*. ML-ranked, not chronological.

### B. Cross-system / agency-specific

6. **Live cross-system cells** — column types that pull from existing integrations (`MetaSpendCell`, `XeroInvoiceCell`, `BriefStatusCell`). Refresh on schedule via Workers + KV cache.
7. **Per-cell client visibility** — flag individual cells (not whole tasks) as client-visible; auto-publishes to existing Client Portal.
8. **EOM / billing board overlay** — toggleable overlay joining `task_column_values` with `eom_invoices` to show revenue/cost/profit per row.

### C. Realtime / collab depth

9. **Figma-style co-presence** — live cursors, "Sarah is editing B47" indicators, typing dots. Extends current BoardRoom DO.
10. **Time-anchored comments** — comment threads pinned to a *historical* cell state, not just current value.

### D. Analytics / health

11. **Instruments HUD** — small overlay: throughput (items/day), cycle time, WIP, aging (oldest task), velocity trend.
12. **Predictive completion + risk pill** — every task gets 🟢/🟡/🔴 based on historical patterns + owner load + dependencies. Rolls up to board-level "73% likely on time".

### E. Workflow primitives

13. **Cross-board dependencies** — a task in Board A can hard-block a task in Board B; upstream movement auto-shifts downstream. Adds dependency-graph view.
14. **Board-as-code export** — boards round-trip to YAML (columns, groups, automations, views). Version-controlled in Git, deploy by PR.
15. **Capacity map view** — workspace-level view of teammates as cards: current load, last-24h activity, upcoming deadlines, "available right now".

## Phasing

Each phase is an independent unit of work that ships visible value. Earlier phases unlock later ones. **Phase 0** runs as a parallel tech-debt track that doesn't block any feature phase.

### Phase 0 — Tech foundations (parallel track)

**Goal:** pay down the debt that will otherwise compound through every phase below.

**Includes:**
- **Schema squash** — consolidate ~50 incremental migrations into a canonical `schema/boards-v2.sql`; deprecate the legacy `task_monday_column_values` fallback in `[id]/index.get.ts`
- **Cell registry consolidation** — replace 18 of 24 thin cell wrappers with a `CellSmart.vue` driven by a column-type registry (`{ inputComponent, validator, parser, renderer }`)
- **BoardRoom observability** — emit metrics from the Durable Object (events/sec, active connections, drops, presence lag); admin-only "realtime healthy / degraded" pill
- **E2E test scaffolding** — Playwright suite for the canonical workflow (create board → add column → add item → edit cell → trigger automation → verify chat feed); runs against preview deploys

**Why parallel:** none of these block the feature phases; they all reduce friction in later phases. Owner can pick them off opportunistically.

### Phase 1 — Signal Foundation

**Goal:** build the substrate every "intelligent" feature needs.

**Includes:**
- Per-user `last_seen_at` per board (new table `board_user_seen`)
- Persistent board event log (delta-level, not just SSE in-memory)
- Daily metrics rollup (throughput, cycle time, WIP, aging) cached in KV / D1
- Visible features built on top: **#5 Smart triage inbox** + **#11 Instruments HUD**

**Unlocks:** #1, #5, #11, #12, #15

**Why first:** without this, predictive (#12), capacity (#15), AI agent (#1), and triage (#5) all become hacky. Two visible features mean it's not pure plumbing.

### Phase 2 — Live cross-system cells

**Goal:** generic "external data cell" pattern + concrete bindings.

**Includes:**
- New cell-type contract: `external` (config: source, refresh schedule, cache TTL, fallback)
- Concrete implementations: `MetaSpendCell`, `XeroInvoiceCell`, `BriefStatusCell`
- **#8 EOM/billing overlay** — free once cells exist (joins `task_column_values` ↔ `eom_invoices`)

**Unlocks:** #6, #8, primitives reusable for any future external source.

### Phase 3 — AI layer

**Goal:** one shared tool/intent runtime serving three surfaces.

**Includes:**
- Tool schema + executor (board CRUD, item CRUD, status changes, assignments) with audit trail
- **#1 AI PM Agent** (Cron-driven daily pass)
- **#2 Natural-language board operator** (chat → mutations)
- **#3 Voice quick-capture** (STT → parser → preview → confirm)

**Depends on:** Phase 1 signal foundation (agent needs metrics to be useful).

### Phase 4 — Collab depth

**Goal:** raise realtime collaboration to 2026 expectations.

**Includes:**
- **#9 Figma-style co-presence** (cursors, edit indicators, typing dots)
- **#10 Time-anchored comments** (comment + cell-version anchor)

**Depends on:** existing BoardRoom DO; may need DO state expansion (presence ring buffer, comment anchors).

### Phase 5 — Workflow primitives (parallelisable)

Each ships independently after Phase 1 lands:

- **#4 What-if simulator**
- **#7 Per-cell client visibility**
- **#12 Predictive risk pills** (needs Phase 1)
- **#13 Cross-board dependencies**
- **#14 Board-as-code export**
- **#15 Capacity map view** (needs Phase 1)
- **#16 Formula columns** — wire the `formula` column type that's already in the ENUM but never implemented. Client-side eval (HyperFormula-style) for sums/refs; server-side memoised eval for cross-row aggregates.
- **#17 Conditional / chained automations** — extend `BoardAutomationBuilder` with if/else branches, action chains, and an outbound webhook action. Persist as JSONB step-list in `board_automations.action_config`.
- **#18 View state persistence (per-user)** — store column widths, group-collapse state, scroll anchor, active filter chips per (view × user) so layouts don't reset on refresh.

## Dependency graph

```
Phase 1 (Signal Foundation)
  ├── #5 Smart triage inbox            (in Phase 1)
  ├── #11 Instruments HUD              (in Phase 1)
  ├── #12 Predictive risk pills        (Phase 5)
  ├── #15 Capacity map view            (Phase 5)
  └── enables → Phase 3 AI agent (#1)

Phase 2 (Live cells)
  └── #8 EOM overlay                   (in Phase 2)

Phase 3 (AI layer)
  ├── #1 AI PM Agent                   (depends on Phase 1)
  ├── #2 NL operator                   (independent)
  └── #3 Voice quick-capture           (independent, reuses existing voice infra)

Phase 4 (Collab depth)
  ├── #9 Co-presence                   (independent)
  └── #10 Time-anchored comments       (independent)

Phase 5 (Primitives — any order)
  ├── #4 What-if simulator
  ├── #7 Per-cell client visibility
  ├── #12 Predictive risk pills        (needs Phase 1)
  ├── #13 Cross-board deps
  ├── #14 Board-as-code
  ├── #15 Capacity map view            (needs Phase 1)
  ├── #16 Formula columns
  ├── #17 Conditional automations
  └── #18 View state persistence

Phase 0 (Tech foundations — parallel track)
  ├── Schema squash
  ├── Cell registry consolidation
  ├── BoardRoom observability
  └── E2E test scaffolding
```

## Success metrics (per phase, owner to define before design)

- **Phase 1:** % of users who open the triage inbox daily; time-to-find-changes survey
- **Phase 2:** number of live cells deployed; cache-hit rate; staleness incidents
- **Phase 3:** AI PM Agent suggestion accept rate; NL operator successful-mutation rate; voice capture completion rate
- **Phase 4:** simultaneous editors per board (median); comment thread engagement
- **Phase 5:** per-feature success criteria defined at design time

## Risks

- **AI hallucination / unsafe mutations** (Phase 3): NL operator must require confirm step on destructive ops; voice capture should always preview before commit.
- **Realtime backpressure** (Phase 4): co-presence will significantly increase WS message volume; BoardRoom hibernation behavior + ring-buffer sizing must be re-validated.
- **External API rate limits** (Phase 2): Meta/Google Ads/Xero have aggressive limits; cache layer is mandatory; need fallback rendering when stale.
- **Schema drift** (cross-cutting): each phase adds tables; migration squash should be scheduled before Phase 5 to avoid 70+ migration files.

## Reconciliation with prior round

Mapping the earlier 12 R&D ideas to this roadmap:

| Prior idea | Status |
|---|---|
| Workspace pulse | Folded into **#11 Instruments HUD** (Phase 1) at workspace + board scope |
| "Since you" digest | Folded into **#5 Smart triage inbox** (Phase 1) |
| Formula columns | Tracked as **#16** (Phase 5) |
| AI status nudges | Folded into **#1 AI PM Agent** (Phase 3) |
| Conditional automations | Tracked as **#17** (Phase 5) |
| View state persistence | Tracked as **#18** (Phase 5) |
| Realtime metrics | Tracked in **Phase 0 — BoardRoom observability** |
| Cell registry consolidation | Tracked in **Phase 0** |
| AI board summary | Folded into **#1 AI PM Agent** (Phase 3) |
| Quick capture routing | Folded into **#2 NL operator** + **#3 Voice quick-capture** (Phase 3) |
| Schema squash | Tracked in **Phase 0** |
| E2E test scaffolding | Tracked in **Phase 0** |

Nothing from the prior round is dropped.

## Out of scope (now)

- Mobile-first board redesign
- Net-new pricing/tier work
- Replacing the legacy `task_monday_column_values` read path (Phase 0 deprecates it; full removal is a separate cleanup)

## Open questions for first deep-dive

1. Which phase do we design first? (Recommendation: Phase 1.)
2. For Phase 1: do we want the event log as a new table, or extend `BoardRoom` DO storage? (Trade-off: queryability vs latency.)
3. Naming: "Triage Inbox" overlaps with existing `inbox.vue` page — do we merge or keep separate?

## Next step

Pick a phase. The next document will be a per-phase design (`docs/superpowers/specs/YYYY-MM-DD-boards-phase-<N>-<topic>-design.md`), not another roadmap.
