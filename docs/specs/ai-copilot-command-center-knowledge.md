# Spec: AI Command Center + Agent Knowledge Contribution

**Status:** Design — implementation-ready
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md)
**Related:** [Memory architecture](./ai-copilot-memory-architecture.md), [Phase 0 plan](./ai-copilot-phase-0-plan.md), [Traffic Controller](./ai-copilot-traffic-controller.md), [Portal agent](./ai-copilot-portal-agent.md)
**Created:** 2026-06-19
**Touches:** `server/api/agency/ai/{knowledge,training}/*`, `ai_knowledge_articles` (mig 016), `app/pages/agency/ai/*`

---

## 1. Two questions, two answers

You asked: (a) does each co-pilot get a **command center**, and (b) will they **use** the KB and **create their own inserts** into it. Short answers:

- **Command center: yes — one AI Command Center with a tab per skill-pack**, not N scattered pages. You already have the shell (`/agency/ai/{index,chat,knowledge,training,settings,reports}`); this elevates it.
- **KB reads: yes, already live** — every agent reads via `search_knowledge` (fail-closed to *published* `knowledge_article` rows, clientScope-aware).
- **KB writes: yes, but via propose → review → publish — never auto-publish.** This is the one place the design must be strict (see §3).

## 2. The critical distinction: Memory ≠ Knowledge Base

Your phrasing ("agents creating their own inserts into the knowledge base") blends two stores that must stay separate. This is the most important point in the spec:

| | **Personal Memory** (`ai_user_memory`, Phase 0) | **Agency Knowledge Base** (`ai_knowledge_articles`, mig 016) |
|---|---|---|
| Scope | private, per-user (`user_id`) | shared, agency-wide ("connected to the agency") |
| Trust | low-stakes, individual | authoritative — *every* agent + user reads it |
| Write | **auto** (distiller, on every turn) | **proposed → human-reviewed → published** |
| Purpose | "how Sarah works" | "what the agency knows / its truth" |
| Read path | injected into that user's prompt | `search_knowledge`, all users, published-only |

**Why agents must NOT auto-publish to the KB:** `search_knowledge` is fail-closed to *published* rows. If an agent auto-publishes its own unverified inference and then reads it back as fact — across every user — you get a self-reinforcing drift / hallucination-amplification loop. Curated shared truth requires a human gate. (Personal memory is safe to auto-write precisely because it's private and low-stakes.)

So: **agents write freely to *memory*; agents *propose* to the *KB*.**

## 3. Agent knowledge contribution (the write path)

A new write tool, on the propose→confirm spine:

```
propose_knowledge_article  (mutates: true)
  → drafts an ai_knowledge_articles row with is_published = FALSE,
    source = 'agent', author_id = the proposing user
  → surfaces in the Command Center "KB drafts" review queue
  → a permitted human edits/approves → is_published = TRUE → embedded into Vectorize → searchable
```

This reuses existing machinery:
- **`is_published = false` already exists** (mig 016) — drafts are simply unpublished rows; `search_knowledge` already ignores them. No schema change needed for the gate.
- **There's a precedent approve flow** — `training/knowledge/[id]/approve.patch.ts`. Mirror it for `ai_knowledge_articles` (`knowledge/[id]/publish.patch.ts`).
- **Embedding on publish** — reuse `aiVectorize.upsertVector` with metadata `{ type: 'knowledge_article', clientScope? }` so the fail-closed read filter keeps working.

Add provenance columns (additive, mig 182): `source` already exists; add `proposed_by_agent BOOLEAN`, `review_status TEXT ('draft'|'approved'|'rejected')`, `reviewed_by UUID`, `reviewed_at TIMESTAMPTZ`. The action is **audited** via `ai_action_audit` like any other write.

**Where agent inserts come from (good sources):** a recurring Q the agent couldn't answer → drafts an FAQ; a resolved process the team repeats → drafts an SOP; a meeting artifact (office) → drafts a knowledge note. All **drafts**, all reviewed.

## 4. The Command Center

One hub, `/agency/ai` elevated, with a tab per skill-pack (Finance, Media Buyer, Account, …) and a global view. Per skill-pack it shows **Configure / Observe / Knowledge** — built almost entirely on Phase-0 data:

**Configure**
- Tools enabled (the skill-pack allowlist ∩ RBAC), persona preamble, KB categories in scope, memory on/off, write-tier (read | propose | execute), flags.

**Observe** (reuses Phase-0 ledgers — no new data)
- **Proposals queue** — open `ai_pending_actions` (confirm/cancel).
- **Action audit** — `ai_action_audit` feed (who proposed, who confirmed, outcome, rollback).
- **Usage/cost** — per-turn cost (already tracked on `ai_messages.cost_usd`), tool-call traces.
- **Memory** — view/clear that surface's memories (per-user, admin offboarding).

**Knowledge**
- **KB drafts review queue** (agent-proposed `is_published=false`) — edit, approve→publish, reject.
- Published KB browse/search, `usefulness_score`, `view_count` (already in mig 016).
- "What this agent has contributed" — provenance view.

> The Command Center is mostly **assembly of data Phase 0 already produces** (`ai_pending_actions`, `ai_action_audit`, `ai_messages` cost, `ai_user_memory`, `ai_knowledge_articles`). It's the human cockpit over the whole co-pilot fleet.

## 4a. Self-service configuration — tiered (validated against OpenAI Workspace Agents)

OpenAI's [Workspace Agents](https://help.openai.com/en/articles/20001143-chatgpt-workspace-agents-for-enterprise-and-business) (successor to custom GPTs) ship a 3-tier model — **admin governs / builder composes / user runs** — where **permissions flow through the individual's own account** ([VentureBeat](https://venturebeat.com/orchestration/openai-unveils-workspace-agents-a-successor-to-custom-gpts-for-enterprises-that-can-plug-directly-into-slack-salesforce-and-more), [IT Pro](https://www.itpro.com/technology/artificial-intelligence/four-things-you-need-to-know-about-openais-new-workspace-agents-for-chatgpt-including-how-to-build-your-own)). This validates our posture — that *permission-inheritance* model **is** our RBAC-ceiling + `clientScope`. We adopt the same tiering, with one hard invariant:

> **The golden rule: configuration NARROWS within the RBAC ceiling — it never GRANTS.** A user tuning their co-pilot can disable tools, change tone, add personal knowledge — but can never give themselves a tool their role lacks. Enforced by `filterToolsForUser` (the user's config is *intersected*, exactly as personas already are).

| Tier | Who | Can configure | Surface |
|---|---|---|---|
| **Personalize** | every employee | their own co-pilot, within their ceiling: persona/tone, which permitted tools are active, pinned KB categories, memory on/off, default skill-pack | "My Assistant" settings (lightweight, low-risk) |
| **Build/compose** | gated (`MANAGEMENT` or a `can_build_agents` permission) | saved mini-skill-packs: a named tool subset + saved prompt + optional schedule (e.g. media buyer's "weekly pacing recap"), shareable to their team | Command Center → Build |
| **Govern** | admin (`ADMIN`) | the ceiling itself: which tools/write-tiers exist per role, approval policy (`auto`/`confirm`/`rich_confirm`), who can build/share, kill-switch (suspend an agent) | Command Center → Configure |

**Our differentiator vs OpenAI:** their builder wires *external* connectors (Slack/Salesforce/Gmail). Ours composes **native internal skill-packs** — the co-pilot already executes *inside* the system of record, so "configuration" assembles in-platform capabilities, not external read-only connectors. (External connectors remain a possible later add; native execution is the moat.)

**Governance carry-over (all already specced):** write actions from any user-built agent still flow through propose→confirm→audit (`ai_pending_actions` + `ai_action_audit`); the audit feed is our Compliance-API equivalent; admins can suspend via flags. Shared/built agents do **not** escalate privilege — every run is re-filtered against the *running user's* RBAC, never the builder's.

Data: a `ai_agent_configs` table (mig 183) — `{ id, owner_user_id, scope (personal|shared), name, persona_key, tool_overrides JSONB, kb_categories, schedule, created_by }`. Tool overrides are always intersected with RBAC at run time; the table can only ever *subtract*.

## 5. Per-surface scoping

- **Staff command center** (`/agency/ai`) — full configure/observe/knowledge, RBAC-gated (ADMIN/MANAGEMENT to configure; everyone sees their own usage).
- **Portal agents** contribute to **client-scoped** knowledge only — `propose_knowledge_article` on the portal writes `clientScope`-tagged drafts, reviewed by the **agency** (not the customer), and surfaced only within that client. A customer agent never writes to the shared agency KB.
- **Office assistant** — meeting artifacts can seed KB drafts via the same propose path.

## 6. Sequencing

1. **Phase 0** (memory, executor/audit) — supplies the Command Center's data and the write spine.
2. **Command Center v1 (Observe)** — assemble proposals + audit + cost + memory views over `/agency/ai`. Pure read/assembly; high value, low risk.
3. **`propose_knowledge_article` + publish/review queue** — agent KB contribution, reviewed. Mig 182 (provenance columns).
4. **Command Center v2 (Configure)** — per-skill-pack config surface (drives the registry the [traffic controller](./ai-copilot-traffic-controller.md) reads).

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Agent self-publishes → KB drift / hallucination loop** | Hard rule: agent KB writes are `is_published=false` drafts; human review→publish; `search_knowledge` stays fail-closed |
| Memory/KB conflated → private facts leak into shared KB | Two stores, two write paths (§2); memory never auto-promotes to KB |
| Customer agent pollutes agency KB | Portal drafts are `clientScope`-tagged, agency-reviewed, client-visible only |
| Command Center becomes a new data silo | Built as assembly over existing Phase-0 tables, not new state |
| Unreviewed drafts pile up | Review queue with counts in Command Center; optional auto-expire stale drafts |

## 8. Acceptance criteria

- [ ] Every agent reads the KB (`search_knowledge`, published-only) — already true; verified.
- [ ] `propose_knowledge_article` creates an `is_published=false` draft, audited, never searchable until approved.
- [ ] A permitted human approves a draft → published → embedded → searchable; reject path works.
- [ ] Memory and KB remain separate stores; no auto-promotion of memory into the shared KB.
- [ ] Command Center shows, per skill-pack: proposals queue, action audit, cost, memory, KB drafts — from existing Phase-0 data.
- [ ] Portal-agent KB drafts are `clientScope`-tagged and agency-reviewed; never reach the shared agency KB.
- [ ] Mig 182 additive; zero new type errors; `/code-review high` clean.

---

### Sources
- [Human-in-the-Loop 2026 (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/) · [State of AI Agent Memory 2026 — memory vs knowledge (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026) · [Guardrails & Governance — CIO blueprint](https://www.cio.com/article/4094586/guardrails-and-governance-a-cios-blueprint-for-responsible-generative-and-agentic-ai.html)
