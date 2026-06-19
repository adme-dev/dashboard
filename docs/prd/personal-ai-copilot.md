# PRD: Personal AI Co-pilot for Every Team Member

**Status:** Draft (R&D / discovery)
**Author:** Paul Giurin (with Claude Code R&D)
**Created:** 2026-06-19
**Product:** XeroFlow Agency
**Related work:** AI tool-calling Slice 1/2 (live, flag-gated), Slice 1.5 personas (live), `feat/budget-write-execution` (built, not merged), Voice Admin AI (merged, not deployed)
**Companion specs:** [Memory architecture](../specs/ai-copilot-memory-architecture.md) · [Phase 0 plan](../specs/ai-copilot-phase-0-plan.md) · [Media Buyer skill-pack](../specs/ai-copilot-media-buyer-skillpack.md) · [Virtual Office integration](../specs/ai-copilot-virtual-office-integration.md) · [Client-Portal agent (customer-facing)](../specs/ai-copilot-portal-agent.md) · [Traffic-Controller (orchestration)](../specs/ai-copilot-traffic-controller.md) · [Command Center + Knowledge contribution](../specs/ai-copilot-command-center-knowledge.md)

---

## 1. Executive Summary

Give **every team member their own AI co-pilot** — a personal assistant that knows who they are, understands the platform, and can *execute* work on their behalf within their role's permissions.

The core insight from this R&D: **we do not build a separate bot per department.** We already have ~80% of the engine. We build **one co-pilot, many skill-packs** — a single agentic tool-calling loop, where what differs per person is (1) their role *skill-pack* (tool allowlist + instructions + knowledge scope), (2) their *personal memory*, and (3) their *RBAC permissions* — all of which are **data, not new code**.

This reframes the project from a multi-bot moonshot into the productization of assets we have already shipped piecemeal (personas, tool-calling, propose/confirm writes, voice, budget-write execution). The two genuinely net-new investments are **per-user long-term memory** and the **per-role tool build-out**. Everything else is wiring.

**Differentiator:** competitors ship horizontal copilots that *reach into* agency data (Jasper, Descript Underlord, Adobe Marketing Agent for M365). Ours lives **inside the system of record where the work executes** — it can adjust the live Meta budget, convert a brief into tasks, and generate the EOM invoice, within RBAC and with audit. That "advise → execute in-platform" loop is the 2026 "copilot → coworker" thesis, and we can claim it natively because we own the full agency stack.

---

## 2. Problem Statement

Agency staff — designers, media buyers, sales, account managers, producers, finance, bookkeepers, leadership — operate across 11+ modules and 1,500+ API endpoints. The platform is powerful but broad; each role only touches a slice, and the cognitive load of "where do I do X, and what's the next best action" is high.

Today's AI chat (`/agency/ai/chat`) is a single generic assistant. It does not:
- Know who the user is beyond their RBAC role at request-time.
- Remember how an individual works (their clients, preferences, recurring routines).
- Present a role-shaped set of capabilities — every user sees the same generic surface.
- Execute most write actions — only `create_task` is wired as a propose→confirm tool.

**Result:** the assistant is a "chatbot with our data," not "my assistant who knows how I work and does my work with me."

---

## 3. Goals & Non-Goals

### Goals
- **G1.** Every team member gets a co-pilot that is useful on day one (read/insight), scoped to their role.
- **G2.** The co-pilot feels *personal* — it remembers the individual's facts, history, and routines.
- **G3.** The co-pilot can *execute* in-platform actions safely, role by role, with human-in-the-loop confirmation and full audit.
- **G4.** Reuse the existing agentic substrate; minimize net-new infrastructure.
- **G5.** Establish governance that scales as write actions fan out across staff.

### Non-Goals (for v1)
- **NG1.** Full multi-agent / agent-to-agent (A2A) supervisor orchestration. Deferred to Phase 3, only for cross-department end-to-end workflows.
- **NG2.** Autonomous (no-human) execution of high-risk actions (Xero pushes, live ad-budget changes). Always human-confirmed in v1.
- **NG3.** Fine-tuning bespoke per-user models. Personalization is via memory + prompting, not training.
- **NG4.** Replacing any existing role; the framing is augmentation/co-pilot, not headcount reduction.

---

## 4. Current-State Inventory (what we already have)

### 4.1 Agentic substrate (production-grade)

| Capability | Status | Location |
|---|---|---|
| Agentic tool-calling loop (AI SDK v6, 5-step cap, 25s deadline, cost cap) | ✅ live | `server/utils/ai/toolLoop.ts` |
| RBAC-gated tools (two-layer: pre-send filter + execution re-check) | ✅ live | `server/utils/ai/toolRegistry.ts`, `server/utils/permissions.ts` |
| Personas that narrow toolsets per role (finance / marketing / sales / account) | ✅ live | `server/utils/ai/personas.ts` |
| Human-in-the-loop write confirmation (Option B propose→confirm) | ✅ live | `confirm-action.post.ts`, `ai_pending_actions` |
| Per-user memory (conversations + learned feedback patterns) | ⚠️ partial | `server/utils/aiChatEngine.ts`, `ai_feedback` |
| Semantic knowledge (Vectorize bge-base-en-v1.5, 768-dim) | ✅ live | `server/utils/aiVectorize.ts`, `search_knowledge` |
| Voice mode (STT/TTS continuous loop) | ✅ live | `transcribe.post.ts`, `speak.post.ts` |
| Prompt-injection defense (spotlight untrusted data) | ✅ live | `server/utils/ai/spotlight.ts` |
| Cost tracking & per-turn budget cap | ✅ live | `toolLoop.ts`, `AI_LOOP_BUDGET_USD` |

### 4.2 Models

- **Primary:** `groq/openai/gpt-oss-120b` (`AI_LOOP_MODEL`)
- **Fallback:** `groq/openai/gpt-oss-20b` (`AI_LOOP_FALLBACK_MODEL`)
- **Dormant escape hatches:** `anthropic/claude-sonnet-4-6`, `moonshotai/kimi-k2-instruct`
- **Edge:** Cloudflare Workers AI (`@cf/...`) via `AI` binding
- **Gateway:** Cloudflare AI Gateway when `AI_GATEWAY_URL` set (unified billing, caching, analytics)
- **Feature flag:** `AI_TOOLS_ENABLED` (off by default — agentic loop only fires when true + non-trivial intent)

### 4.3 Existing tools (13 read + 1 write)

Read: `get_finance_snapshot`, `get_adspend_pacing`, `get_tasks`, `get_project_status`, `get_open_anomalies`, `get_client_overview`, `search_knowledge`, `get_social_performance`, `get_briefs`, `get_client_profitability`, `monitor_retainer_burn`, `flag_over_servicing`, `forecast_revenue`.
Write (propose→confirm): `create_task`.

Untrusted tools (`returnsUntrusted: true`, spotlighted): `get_open_anomalies`, `search_knowledge`, `get_social_performance`, `get_briefs`.

### 4.4 Org / role model

- **15 system roles:** `owner, admin, lead, project_manager, account_manager, creative, media_buyer, producer, finance, accounts, developer, sales, member, viewer, guest`.
- **10 permission groups:** `ADMIN, MANAGEMENT, FINANCE, SALES, CLIENTS, CREATIVE, MEDIA_BUYING, TIME_APPROVALS, AUTOMATION, INVOICE_OWN_CLIENTS`.
- **Grouping:** `departments`, `department_members` (lead/senior/member/junior), `client_team_assignments` (primary_am/secondary_am/support).
- **Enforcement:** `requireAuth`, `requireRole`, `requireWriteAccess`, permission-group mapping in `server/utils/permissions.ts` + `roleResolver.ts`.

---

## 5. Proposed Architecture

### 5.1 Core principle: one co-pilot, many skill-packs

The 2026 orchestration consensus is explicit: *"Use the lowest level of complexity that reliably meets your requirements"* ([Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)). Multi-agent supervisor systems win on **scale / parallel batches** — one study held **90.6% accuracy at 5 concurrent tasks vs single-agent's 73%, and 65.3% vs 16.6% at 80 tasks** ([medRxiv orchestration study](https://www.medrxiv.org/content/10.1101/2025.08.22.25334049.full.pdf), [Towards Data Science](https://towardsdatascience.com/single-agent-vs-multi-agent-when-to-build-a-multi-agent-system/)) — but they add latency, cost, and coordination overhead we don't need yet.

```
        ┌─────────────────── Personal Co-pilot (per user) ───────────────────┐
        │                                                                     │
  Identity ──► RBAC permission groups ──► Role skill-pack (persona++)         │
  (who you are)   (what you can touch)      (tools + instructions + KB scope) │
        │                                         │                           │
        │                            ┌────────────┴───────────┐               │
        │                       Read tools              Write tools           │
        │                    (execute directly)    (propose → confirm → exec) │
        │                                                                     │
        └─ Personal memory: semantic (prefs) + episodic (history) + procedural (routines) ─┘
```

Every team member runs the **same engine**. Three things differ per person, all data:
1. **Skill-pack** — the persona's tool allowlist (∩ RBAC) + role-specific system instructions + knowledge scope.
2. **Memory** — personal semantic / episodic / procedural memory.
3. **Permissions** — already enforced by `requireRole` / permission groups.

The Slice 1.5 personas concept **is** the seed of "an assistant per department." We grow 4 personas + 14 tools into a personal co-pilot every role trusts.

### 5.2 When to graduate to multi-agent (Phase 3)

Adopt a **supervisor / A2A** pattern *only* for genuinely cross-department, long-running workflows (e.g. "brief → tasks → design → media-buy → invoice" end-to-end), where an orchestrator decomposes, delegates to specialist agents, and synthesizes ([kore.ai orchestration patterns](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)). Microsoft's Copilot Studio now ships A2A GA for this exact pattern ([EPC Group enterprise guide](https://www.epcgroup.net/blog/microsoft-copilot-agents-complete-enterprise-guide-2026)). Keep it as Phase 3, not Phase 1.

---

## 6. The Memory System (highest-leverage net-new work)

We have conversation history + learned feedback patterns. The 2026 state-of-the-art standardizes on **three memory scopes** — we are missing two as first-class structures ([mem0: State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026), [MachineLearningMastery: 3 types of long-term memory](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/)).

| Scope | Stores | Status | Example (media buyer "Sarah") |
|---|---|---|---|
| **Semantic** | facts & preferences | ⚠️ partial (`ai_feedback`) | "Sarah manages Acme + Bunnings, prefers ROAS over CPA, reports in AUD" |
| **Episodic** | summarized past interactions | ⚠️ raw history only | "Last Tuesday Sarah paused Acme retargeting when CPC hit $2.50" |
| **Procedural** | learned workflows / routines | ❌ missing | "Sarah's Monday routine: sync spend → check pacing → draft client recap" |

**Reference retrieval pipeline** ([mem0](https://mem0.ai/blog/long-term-memory-ai-agents), [47billion](https://47billion.com/blog/ai-agent-memory-types-implementation-best-practices/)): embed query → top-k≈20 candidates → score by `relevance × recency × type_weight` (semantic 0.6 / episodic 0.3 / procedural 0.1) → inject top-5 under ~200 tokens.

**Implementation approach:** extend `aiVectorize.ts`, scoped by `user_id`. This is an extension of existing Vectorize usage, not a new system. Scope memory by User ID / Agent ID / Session ID / Org (shared) for personalization with privacy separation.

**Frameworks to study (not necessarily adopt):** Mem0 (vector recall), Zep/Graphiti (temporal knowledge graph), Letta/MemGPT (self-editing memory blocks), LangGraph/LangMem ([Vectorize comparison](https://vectorize.io/articles/best-ai-agent-memory-systems), [Atlan comparison](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/)).

> This is the single highest-leverage investment — the difference between "a chatbot with our data" and "my assistant who knows how I work."

---

## 7. Per-Department Blueprint

Each department = a skill-pack (persona allowlist + new tools). **Bold = net-new tools to build** (we have the endpoints, not yet the agent tools). The pattern is identical every time: a **read tool over an existing GET endpoint** + a **`propose_*` write tool** that drops a row in `ai_pending_actions` and reuses the confirm flow (proven by `create_task`).

| Department (role) | Reads | Executes (propose→confirm) | Tools to add |
|---|---|---|---|
| **Graphic Designer** (`creative`) | briefs, proofs, brand kits | generate banner/image, resize, export, request proof approval | `get_my_creative_queue`, **`propose_banner`**, **`generate_image`**, **`propose_proof_status`** |
| **Media Buyer** (`media_buyer`) | ✅ adspend pacing, social perf | adjust budget (built on `feat/budget-write-execution`), set budget alert, schedule post | wire **budget-write** as a tool, **`propose_budget_alert`**, **`propose_schedule_post`** |
| **Sales** (`sales`) | ✅ client overview, briefs, CRM | create opportunity, log activity, draft follow-up, generate quote | **`propose_opportunity`**, **`log_crm_activity`**, **`draft_followup`**, **`propose_quote`** |
| **Account Manager** (`account_manager`) | ✅ client, project, tasks, social | convert brief→project, assign task, post client update | **`propose_brief_convert`**, **`assign_task`** |
| **Producer / PM** (`producer` / `project_manager`) | ✅ tasks, capacity | ✅ create_task, reassign, subtasks, status | **`propose_assign`**, **`propose_status_change`**, `get_capacity` |
| **Finance** (`finance`) | ✅ snapshot, profitability, retainer burn, forecast | approve expense, generate EOM run, validate Xero | **`propose_expense_approval`**, **`propose_eom_generate`** |
| **Bookkeeper** (`accounts`) | ✅ AR/AP, snapshot | classify/match expense, reconcile | **`propose_expense_classify`** |
| **Business Owner** (`owner` / `admin`) | ✅ everything + anomalies | cross-department oversight | the supervisor agent (Phase 3) |

### 7.1 Endpoint coverage by department (already exists)

- **Creative:** `banner-studio/*` (111 endpoints), `video/*`, `audio/*`, `proofs/*`
- **Media Buyer:** `analytics/*`, `social/meta/*`, `social/google/*`, `budget-alerts/*`, `banner-studio/publish`
- **Sales:** `crm/*` (101 endpoints), `briefs/*`, `leads/*`, `intake/*`
- **Account Manager:** `clients/*`, `projects/*`, `briefs/[id]/convert`, `proofs/*`
- **Producer/PM:** `tasks/*` (40), `boards/*` (41), `capacity/*`
- **Finance:** `eom/*` (16), `invoices/*`, `expenses/*`, `xero/*` (80), `rate-cards/*`
- **Bookkeeper:** `expenses/*`, `invoicing/classify`, `xero/reports/*`
- **Owner:** `anomalies/*`, all of the above, `ai/agent/*`

---

## 8. Governance & Safety

The 2026 governance literature converges on patterns we partly have ([Berkeley CMR: Governing the Agentic Enterprise](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/), [Strata: HITL 2026 guide](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/), [CIO: guardrails blueprint](https://www.cio.com/article/4094586/guardrails-and-governance-a-cios-blueprint-for-responsible-generative-and-agentic-ai.html)).

### 8.1 Tiered autonomy

| Tier | Action class | Flow |
|---|---|---|
| **Auto** | Reads | Execute directly inside the loop |
| **One-click confirm** | Low-risk writes (create task, log activity) | Existing propose→confirm card |
| **Rich confirm** | High-risk writes (push invoice to Xero, change live ad budget) | Confirm card showing **intent + data lineage + permissions chain + expected blast radius + rollback plan** (not just "Approve?") |

### 8.2 Guardrail-as-actor

High-risk actions get a **counter-model sanity check** (cheap on `gpt-oss-20b` fallback) before the human sees the confirm card — "two-factor judgment." AI agents have shifted from "tools" to "actors"; guardrail agents block high-risk actions in real time ([Itential / Gartner Predicts 2026](https://www.itential.com/resource/analyst-report/gartner-predicts-2026-ai-agents-will-reshape-infrastructure-operations/)).

### 8.3 Audit ledger

Extend `ai_pending_actions` into a full action-audit ledger: who proposed, who confirmed, what executed, rollback token, timestamps. Non-negotiable once finance / ad-budget writes go live across staff.

### 8.4 Hard rules (carry forward)

- **Never** flip write flags (`AI_TOOLS_ENABLED`, budget-write flags, live social/email sends) without explicit owner sign-off.
- Write tools never write directly — they only **propose** (Option B). The model payload never leaves the server; the client can only submit a `proposalId`.
- Atomic, idempotent claim on confirm (`UPDATE ... WHERE status='proposed' AND expires_at > NOW() AND user_id=$`).
- Untrusted tool outputs remain spotlighted.

---

## 9. Market Positioning (Strategy)

Competitors ship point copilots bolted onto generic suites — Jasper (copy), Descript Underlord (video), Adobe Marketing Agent inside M365 Copilot ([Adobe](https://business.adobe.com/blog/introducing-adobe-marketing-agent-microsoft-365-copilot)), Dust ([top AI agent tools](https://dust.tt/blog/top-ai-agent-tools)). They are **horizontal assistants reaching into data**.

**XeroFlow's wedge:** the assistant lives **inside the system of record where work executes**. Adobe's agent advises on a campaign; ours adjusts the live Meta budget, converts the brief to tasks, and generates the EOM invoice — within RBAC, with audit. That "advise → execute in-platform" loop is the 2026 "copilot → coworker" thesis Microsoft is selling ([Channel Insider](https://www.channelinsider.com/ai/llms-chatbots-and-agents/microsoft-copilot-cowork-agent-ai-workplace/), [EPC Group](https://www.epcgroup.net/blog/microsoft-copilot-agents-complete-enterprise-guide-2026)), and we can claim it natively because we own the full agency stack.

**Marketing sync:** at go-live, update `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, and `app/components/MarketingNav.vue` per the Front-Facing Page Sync rule.

---

## 10. Phased Roadmap

| Phase | Scope | Risk | Status leverage |
|---|---|---|---|
| **Phase 0 — Foundations** (1 sprint) | Per-user memory (3 scopes, `user_id`-scoped Vectorize) + action-audit ledger | Low | Highest leverage; pure extension |
| **Phase 1 — Read-everywhere** (parallel) | Add read tools per role so every department gets a useful day-1 assistant. Flip personas → per-role skill-packs | Zero write risk | Reuses tool pattern |
| **Phase 2 — Execute, role by role** | Roll out `propose_*` write tools one department at a time behind flags. Start where work is done (Producer tasks ✅, Media-buyer budget-write ✅ on branch). Rich confirm cards + counter-model check for high-risk | Medium, gated | Budget-write already built |
| **Phase 3 — Supervisor / A2A** | Cross-department end-to-end workflows only | Higher | Where multi-agent earns its keep |

---

## 11. Success Metrics

- **Adoption:** % of active staff who use their co-pilot weekly (target: >60% within 8 weeks of Phase 1).
- **Personalization quality:** memory-recall relevance (human-rated sample), reduction in repeated context-setting.
- **Execution trust:** propose→confirm acceptance rate; % of confirmed actions not rolled back.
- **Time saved:** self-reported + measured (e.g. time from brief to project, EOM run prep time).
- **Safety:** zero unauthorized writes; 100% of high-risk actions human-confirmed and audited.
- **Cost:** per-user per-month AI spend within budget cap; cost/turn tracked.

---

## 12. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Write actions fan out across many staff → blast radius | Tiered autonomy, rich confirm cards, counter-model check, audit ledger, per-flag rollout |
| Memory leaks cross-user data | Strict `user_id` scoping; org-shared memory explicitly separated; tenant isolation tests |
| Prompt injection via untrusted data (briefs, social, KB) | Existing spotlighting; keep `returnsUntrusted` discipline |
| Latency/cost creep with richer context + memory | Top-5 / ~200-token memory injection cap; budget cap per turn; `gpt-oss-20b` for cheap checks |
| Over-engineering toward multi-agent too early | Hold A2A to Phase 3; single-agent + skill-packs for v1 |
| Governance lags capability (industry-wide pattern) | Formalize tiered autonomy + audit before scaling writes |

---

## 13. Open Questions

1. **Memory store:** extend Vectorize only, or introduce a temporal graph (Zep/Graphiti) for episodic/procedural? Start with Vectorize; revisit if recall quality demands graph.
2. **Procedural memory capture:** auto-infer routines from behavior, or let users define them explicitly? Likely hybrid.
3. **Skill-pack config surface:** hard-coded per role, or admin-editable in UI? Start hard-coded, graduate to config.
4. **Voice rollout:** extend Voice Admin AI to every role's co-pilot at Phase 1, or after?
5. **Counter-model:** `gpt-oss-20b` sufficient as guardrail, or use Workers AI edge model for isolation?
6. **Tenant/data residency:** any constraints on per-user memory storage location?

---

## 14. Appendix: Source Index

**Enterprise copilot / agent architecture**
- [Enterprise AI Agents in 2026: Complete Guide to Agentic Architecture & Multi-Agent Frameworks (press.farm)](https://press.farm/enterprise-ai-agents-in-2026-the-complete-guide/)
- [AI Agent Orchestration Patterns — Azure Architecture Center](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/ai-agent-design-patterns)
- [Single Agent vs Multi-Agent: When to Build a Multi-Agent System (Towards Data Science)](https://towardsdatascience.com/single-agent-vs-multi-agent-when-to-build-a-multi-agent-system/)
- [Choosing the Right Orchestration Pattern for Multi-Agent Systems (kore.ai)](https://www.kore.ai/blog/choosing-the-right-orchestration-pattern-for-multi-agent-systems)
- [Orchestrated multi-agents sustain accuracy under scale (medRxiv)](https://www.medrxiv.org/content/10.1101/2025.08.22.25334049.full.pdf)
- [Microsoft Copilot Agents: Complete Enterprise Guide 2026 (EPC Group)](https://www.epcgroup.net/blog/microsoft-copilot-agents-complete-enterprise-guide-2026)
- [Microsoft's Copilot is Becoming an AI Coworker (Channel Insider)](https://www.channelinsider.com/ai/llms-chatbots-and-agents/microsoft-copilot-cowork-agent-ai-workplace/)

**Memory & personalization**
- [State of AI Agent Memory 2026: Benchmarks, Architectures & Production Gaps (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- [Long-Term Memory for AI Agents: The What, Why and How (mem0)](https://mem0.ai/blog/long-term-memory-ai-agents)
- [Beyond Short-term Memory: The 3 Types of Long-term Memory AI Agents Need (MachineLearningMastery)](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/)
- [AI Agent Memory: Types, Implementation, Best Practices 2026 (47billion)](https://47billion.com/blog/ai-agent-memory-types-implementation-best-practices/)
- [Best AI Agent Memory Systems in 2026: 8 Frameworks Compared (Vectorize)](https://vectorize.io/articles/best-ai-agent-memory-systems)
- [Best AI Agent Memory Frameworks in 2026: Compared and Ranked (Atlan)](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/)

**Governance & human-in-the-loop**
- [Governing the Agentic Enterprise (Berkeley California Management Review)](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/)
- [Human-in-the-Loop: A 2026 Guide to AI Oversight (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)
- [Guardrails and Governance: A CIO's Blueprint (CIO)](https://www.cio.com/article/4094586/guardrails-and-governance-a-cios-blueprint-for-responsible-generative-and-agentic-ai.html)
- [Gartner Predicts 2026: AI Agents Will Reshape Infrastructure & Ops (Itential)](https://www.itential.com/resource/analyst-report/gartner-predicts-2026-ai-agents-will-reshape-infrastructure-operations/)

**Market / competitive (agency copilots)**
- [Top AI Agent Tools in 2026 (Dust)](https://dust.tt/blog/top-ai-agent-tools)
- [Best AI Copilot Tools for Marketing Teams (Fueler)](https://fueler.io/blog/best-ai-copilot-tools-for-marketing-teams)
- [Adobe Marketing Agent for Microsoft 365 Copilot is here (Adobe)](https://business.adobe.com/blog/introducing-adobe-marketing-agent-microsoft-365-copilot)
- [30 Best AI Marketing Tools for 2026 (Marketer Milk)](https://www.marketermilk.com/blog/ai-marketing-tools)

---

*This PRD is R&D / discovery output. No code changes implied. Next step options: (a) deep-dive memory architecture spec, (b) prototype one department skill-pack end-to-end (Media Buyer recommended — budget-write already built), (c) formal Phase 0 plan.*
