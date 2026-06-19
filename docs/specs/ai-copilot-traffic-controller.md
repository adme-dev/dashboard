# Spec: Traffic-Controller Co-pilot (Orchestration Layer)

**Status:** Design — implementation-ready
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md) §5.2 (elevates Phase 3 to a named component)
**Related:** all skill-pack specs, [Phase 0 plan](./ai-copilot-phase-0-plan.md), [Virtual Office](./ai-copilot-virtual-office-integration.md), [Portal agent](./ai-copilot-portal-agent.md)
**Created:** 2026-06-19

---

## 1. What it is (and what it is NOT)

A **traffic controller**: the layer that, for any request, decides *which co-pilot capability should handle it* — and for requests that span departments, **decomposes the work, delegates to the right specialist skill-packs, and synthesizes one answer.**

It is **not an oracle.** It does not hold all knowledge in one model. It is a **router + supervisor** ([Azure AI agent design patterns](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns), [kore.ai orchestration patterns](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)): it understands intent and *who can do it*, then conducts. Knowledge and execution stay in the specialist skill-packs + tools; the controller owns *coordination*.

The 2026 evidence is the design rule: a supervisor wins decisively on **multi-task / cross-domain scale** (one study: 90.6% vs 73% accuracy at 5 concurrent tasks; 65% vs 17% at 80 — [medRxiv](https://www.medrxiv.org/content/10.1101/2025.08.22.25334049.full.pdf)) but adds latency and cost. So the controller's prime directive is *"use the lowest complexity that works"* — most turns never fan out.

## 2. What's already baked in (the routing primitives)

The controller is an *extension* of existing routing, not a rebuild. Present today:

- **`gate.ts`** — trivial-vs-tool-loop decision (`shouldUseToolLoop`).
- **`selectModel(intent, length)`** in `aiChatEngine.ts` — model routing by intent (financial/process/time → stronger model; general/search → cheaper).
- **Intent-aware context retrieval** — `contextBundle.intent` (`AiIntent`: `financial_query`, `process_query`, `time_tracking_query`, `task_query`, `action_request`, `search`, `general`, …) drives what context is fetched.
- **`resolvePersona`** — narrows tools (∩ RBAC) + sets a focus preamble.

**Missing (net-new):** the supervisor itself — capability registry, multi-skill-pack routing, task decomposition, delegation/handoff, and answer synthesis. Graph confirms: 0 hits for orchestrator/supervisor/dispatcher/delegate/handoff/router.

## 3. The routing ladder (complexity tiers)

The controller picks the **cheapest tier that satisfies the request**:

```
L0  Trivial            → fast path (chit-chat). Already exists (gate.ts).
L1  Single-domain      → pick ONE skill-pack (persona + tool subset ∩ RBAC), run the normal
                          tool loop. ~80% of turns. Mostly baked in — formalize persona auto-selection.
L2  Cross-domain       → SUPERVISE: decompose into sub-tasks, delegate each to its specialist
                          skill-pack, gather + synthesize one answer. NET-NEW. The traffic controller.
```

**L1 is the default; L2 fires only when the request provably spans ≥2 domains** the user is entitled to (e.g. "which over-servicing clients are also under-pacing on ads, and draft tasks to fix it" = finance ∩ media ∩ work-management). A classifier decides L1 vs L2; when unsure, prefer L1 + offer to "look across X and Y too."

## 4. Architecture

```
                         ┌──────────────── Traffic Controller ────────────────┐
  user request ─► intent + scope classify ─► route decision (L0/L1/L2)        │
                         │                                                     │
       L1 ◄─────────────┤  single skill-pack (existing tool loop)             │
                         │                                                     │
       L2 ──► decompose ─► delegate to specialist skill-packs (parallel) ─► synthesize ─► answer
                         │        (each a scoped tool-loop run, RBAC-filtered)            │
                         └─────────────────────────────────────────────────────┘
                                   every action still: propose → confirm → audit (Phase 0)
```

New modules:

```
server/utils/ai/controller/
  classify.ts      # PURE: request → { tier: L0|L1|L2, domains: string[], reason } (injected LLM)
  registry.ts      # capability registry: skill-pack key → { domains, tools, persona } (derive from personas + rolePersona)
  route.ts         # PURE: (classification, userRole) → plan (which skill-packs, RBAC-pruned)
  delegate.ts      # run N specialist tool-loops (reuses runToolLoop), collect structured results
  synthesize.ts    # PURE prompt + injected LLM: merge specialist results → one grounded answer
```

Reuse `runToolLoop` for each delegated sub-run (no new engine). Delegation is **bounded fan-out** (cap concurrent sub-runs; per-turn budget still governs via `AI_LOOP_BUDGET_USD`).

## 5. Hard boundaries (non-negotiable)

1. **RBAC is the ceiling, always.** The controller can only route to / delegate capabilities the user is entitled to. It can never assemble a cross-domain answer that includes data the user couldn't get directly. Delegated sub-runs are each RBAC-filtered (`filterToolsForUser`) — defense in depth.
2. **No tenant-boundary crossing.** The controller is a **staff-side** construct. It must **never** bridge into the [client-portal agent](./ai-copilot-portal-agent.md)'s `clientScope` world. The portal gets its own, isolated mini-controller that stays within one `clientScope` — a customer's controller can route across *their own* enabled apps only.
3. **Every action still goes through propose → confirm → audit.** The controller proposes; humans confirm. A supervisor that *executes* across domains without HITL is exactly the failure mode the governance literature warns of ([Berkeley CMR](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/)).
4. **Cost/latency cap.** L2 has a fan-out limit and a wall-clock deadline; if exceeded it degrades to "here's what I found from X; want me to also check Y?" rather than hanging.

## 6. Where it sits relative to the other specs

| Surface | Controller form |
|---|---|
| **Staff chat** (`/agency/ai/chat`) | full L0/L1/L2 traffic controller, RBAC-bounded |
| **Virtual office** (lounge/voice) | same staff controller, room-scoped context; watches can trigger it |
| **Client portal** | **separate** mini-controller, `clientScope`-locked, routes only across the client's enabled apps — never the staff controller |

So the controller is the **conductor of skill-packs**, and the skill-packs (Media Buyer, Finance, Account, …) are its players. The office and portal are *surfaces* it serves under different scope rules.

## 7. Sequencing

1. **Phase 0** (memory + executor/audit) + **≥2 skill-packs** exist — a controller needs players to conduct. Don't build L2 before there are ≥2 real specialist packs to delegate to.
2. **L1 formalization** — auto-select the single skill-pack by intent+role (mostly wiring over `selectModel`/`resolvePersona`/`rolePersona`). Cheap, high value.
3. **L2 supervisor** — classify → decompose → delegate → synthesize, bounded fan-out, behind `AI_CONTROLLER_L2_ENABLED`. Start with 2-domain compositions; expand.
4. **Portal mini-controller** — after portal Tier 1, within `clientScope`.

## 8. Risks

| Risk | Mitigation |
|---|---|
| Over-orchestration (everything becomes L2) → cost/latency | Default L1; L2 only on proven multi-domain intent; fan-out + deadline caps; "lowest complexity that works" |
| Privilege escalation via composition | Each sub-run RBAC-filtered; controller answer ⊆ union of what user could get directly |
| Tenant-boundary leak (staff controller reaching portal) | Separate portal mini-controller; staff controller has no portal tools/registry |
| Unbounded action across domains | propose→confirm→audit per action; controller never executes silently |
| Built before there are agents to conduct | Sequence after ≥2 skill-packs land |

## 9. Acceptance criteria

- [ ] Classifier returns `{tier, domains, reason}`; ambiguous → L1 with an offer to widen.
- [ ] L1 auto-selects one skill-pack by intent+role (RBAC-bounded).
- [ ] L2 decomposes a 2-domain request, delegates to specialist packs in parallel, synthesizes one answer — entirely within the user's RBAC.
- [ ] No L2 answer ever contains data the user couldn't retrieve directly (composition-escalation test).
- [ ] Staff controller has zero portal reach; portal mini-controller never leaves `clientScope`.
- [ ] All cross-domain actions remain propose→confirm→audit; fan-out + deadline caps enforced.
- [ ] L2 behind `AI_CONTROLLER_L2_ENABLED`; zero new type errors; `/code-review high` clean.

---

### Sources
- [AI Agent Orchestration Patterns — Azure](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns) · [Choosing the orchestration pattern (kore.ai)](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems) · [Single vs multi-agent (Towards Data Science)](https://towardsdatascience.com/single-agent-vs-multi-agent-when-to-build-a-multi-agent-system/) · [Orchestrated multi-agents sustain accuracy under scale (medRxiv)](https://www.medrxiv.org/content/10.1101/2025.08.22.25334049.full.pdf) · [Governing the Agentic Enterprise (Berkeley CMR)](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/)
