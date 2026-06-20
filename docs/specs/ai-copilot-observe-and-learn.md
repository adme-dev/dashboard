# Spec: Co-pilot Observe & Learn (Phase 4)

**Status:** Design — implementation-ready
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md) (§6 memory, §13.1–13.2 open questions)
**Related:** [Memory architecture](./ai-copilot-memory-architecture.md), [Virtual office integration](./ai-copilot-virtual-office-integration.md) (Mode C)
**Created:** 2026-06-20

---

## 1. What this is

Today the co-pilot is **reactive** — it does work when asked, then can distil memories from the *conversation*. This phase makes it **learn from the work the employee actually does in the platform**, so it knows their accounts, routines, and rhythms without being told, and (later) can proactively offer to run those routines.

**Key principle — observe the system of record, don't surveil.** The platform already writes an event for every meaningful action: `task_activities` (assignments, status moves), `crm_activities`, `proof_activities`, expense status changes, `eom_runs`, `ai_action_audit`, `client_activity_log`, office `zone_visits`. Observe-and-learn is a per-user processor **over these existing streams** — no new client-side telemetry, no keylogging.

## 2. Governance (internal agency dashboard)

This is XeroFlow's **internal** dashboard; staff are opted in by default (operator decision, 2026-06-20). So:

- **No per-user opt-in gate.** One global rollout flag `AI_OBSERVE_ENABLED` (off by default) + an admin kill-switch. Same dormancy discipline as the rest of the program.
- **Transparency, not consent:** a "What I've learned from your work" panel (see / edit / delete observed memories) ships as good practice, not as a gate.
- **Privacy invariants (still enforced):** a user only ever learns from their OWN actions (`user_id`-scoped); one person's behaviour is never folded into another's memory; sensitive actions (finance approvals, etc.) are excluded from *routine* inference and from any proactive suggestion.

## 3. Pipeline

```
existing activity tables ──► observe (adapter, per-user, watermarked)
   ──► sessionize (PURE: gap-group into episodes; detect recurring routines)
   ──► distil (gpt-oss-20b, dedup vs existing memory)
   ──► write ai_user_memory (source='observed', user-scoped: procedural routines + semantic facts)
   ──► [W-4, gated] proactive suggestion ──► propose→confirm→audit (never auto-execute)
```

## 4. Slices

- **W-1 — Observation substrate** *(pure, zero-risk)*: `ObservedEvent`/`WorkEpisode`/`RoutineCandidate` types; a PURE `sessionize()` (gap-based episode grouping) + `detectRoutines()` (recurrence by weekday/hour/sequence). Plus the adapter *contract* (`WorkEventSource`) that W-2 implements over the real tables. Fully unit-tested without a DB.
- **W-2 — Observed-memory distiller** *(the learning)*: a per-user cron + companion Worker reads new events since a watermark (`ai_observe_state.observed_through_at`), sessionizes, and distils candidate procedural/semantic memories via the existing `gpt-oss-20b` distiller pattern (pure prompt + tolerant parser + injected model, dedup vs recent). Writes `ai_user_memory` with `source='observed'`. Gated `AI_OBSERVE_ENABLED`. Additive migration: `ai_observe_state` (watermark) — `ai_user_memory.source` is already free text.
- **W-3 — Transparency + control**: "Learned from your work" panel in My Assistant (list / edit / delete observed memories), filtered by `source='observed'`. Admin kill-switch surfaced.
- **W-4 — Proactive suggestion** *(separate flag `AI_OBSERVE_PROACTIVE_ENABLED`; HELD for sign-off)*: a confidently-learned routine surfaces a suggestion via the existing notification/digest system ("It's Monday — run your usual spend-check and draft the Acme recap?"). The suggestion routes into the **same propose→confirm→audit** spine. Never auto-executes. Completes the office Mode-C idea.

## 4b. Topology + scope (R&D conclusion, 2026-06-20)

External R&D (Glean, Microsoft CAF/Copilot, mem0/Zep/Letta, Cloudflare) settled two things:

- **Keep the personal co-pilot — do NOT build a shared agent instance per department.** "Shared agent ≠ shared knowledge": knowledge sharing is a property of the memory/KB **scope + ACLs**, not the chat instance. A shared instance also breaks per-user RBAC. The enterprise pattern is *shared definition/KB + per-user identity at query time* ([Glean identity schema](https://www.glean.com/blog/using-our-identity-schema-to-deliver-personalized-permissions-aware-results), [MS Copilot share-agents](https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/agent-builder-share-manage-agents), [Azure CAF single-vs-multi](https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/ai-agents/single-agent-multiple-agents)).
- **Add a department memory scope** — the missing middle tier. The standard is **≥3 scopes: personal (`user_id`, default/auto) → department (`scope_ref=department_id`) → org**; shared scope is **curated, never auto-written**, with promotion gated by human/verifier review ([mem0 entity-scoped](https://docs.mem0.ai/platform/features/entity-scoped-memory), [Atlan 2026](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/)). Enforce scope at the **storage layer** (Vectorize namespace per scope + server-side filter injection), not app code.

**Cloudflare mapping:** Vectorize **namespaces** (`user:<id>` / `dept:<id>` / `org`) for isolation; **Workflows** (GA, durable, free hibernation between steps) for the W-2 batch; Cloudflare's managed **Agent Memory** (private beta) validates the per-scope DO+Vectorize shape but is not required (Neon + Vectorize already matches). No rewrite onto the Agents SDK.

### Slices (added)
- [x] **DS-1 — department-scope memory foundation** (`d620d273`): `ai_user_memory` gains `scope='department'` + `scope_ref` (mig 187, applied); retrieval merges personal (user-scoped) + department (the user's dept_ids) + org; cross-user isolation preserved (the shared path admits only department/org rows).
- [x] **DS-2 — promote-to-department gate** (`8b5b1818`): `propose_team_memory` (MANAGEMENT-gated, propose→confirm→audit) writes `scope='department'` curated memory; never auto. Card view added.
- [ ] **W-2 (revised) — on Workflows** *(next, not started)*: implement `WorkEventSource` over the existing activity tables (task_activities / crm_activities / proof_activities / ai_action_audit / client_activity_log) behind a watermark (`ai_observe_state` mig); run per-user observe→`sessionize`→`detectRoutines`→`distill`→`upsertMemory(source='observed', scope='user')` as a Cloudflare **Workflow** (durable steps, free hibernation), gated `AI_OBSERVE_ENABLED`. Team-wide routines surface as DS-2 proposals to a lead — never auto-promoted. W-1 pure core (`sessionize`/`detectRoutines`) is already built + tested (`751dab27`).
- [ ] **W-3 — transparency panel** in My Assistant (list/delete `source='observed'` + department memories).
- [ ] **W-4 — proactive suggestion** *(HELD for explicit sign-off + its own flag `AI_OBSERVE_PROACTIVE_ENABLED`)*.

## 5. Where it lands — the knowledge-graph question

| Store | Fed by observe-and-learn? |
|---|---|
| **Personal memory** (`ai_user_memory`, procedural/semantic, `user_id`-scoped) | **Yes — primary, auto.** `source='observed'`. Memory auto-writes by design. |
| **Shared agency KB** (`ai_knowledge`, `is_published` gate, Vectorize) | **Not automatically.** Hard rule: KB is propose→review→publish, never auto-publish. A cross-team pattern may be *proposed* to the KB (human publishes); one person's behaviour never silently becomes org knowledge. |
| **graphify code graph** (`graphify-out/`) | **No** — that graph is codebase structure, unrelated to people's work. |
| **Bespoke behaviour/workflow graph** (Zep/Graphiti-style temporal KG) | **Not in v1.** PRD §13.1 open question — start with the existing Vectorize memory; graduate to a graph only if routine recall demands it. |

## 6. Open decisions (held for operator)

1. **How far this phase goes:** ship W-1→W-3 (learns + visible/deletable, still reactive) now; **W-4 proactivity** behind its own flag + explicit go-ahead.
2. **KB rollup:** any promotion of observed patterns to the shared KB stays human-gated (propose→publish); no auto-rollup.

## 7. Acceptance

- Observed actions distil into `source='observed'` personal memories, strictly user-scoped; cross-user isolation test passes.
- Sensitive actions excluded from routine inference.
- Everything dormant behind `AI_OBSERVE_ENABLED`; proactivity behind `AI_OBSERVE_PROACTIVE_ENABLED`; no auto-execution; zero new type errors; `/code-review high` clean.
