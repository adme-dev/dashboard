# Plan: Personal Co-pilot — Phase 0 (Foundations)

**Status:** Plan — ready to execute
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md) §10
**Specs:** [Memory Architecture](./ai-copilot-memory-architecture.md)
**Created:** 2026-06-19
**Migration range:** 180 (memory), 181 (audit ledger)
**Flags:** `AI_MEMORY_DISTILL_ENABLED` (new), reuses `AI_TOOLS_ENABLED`

---

## Why Phase 0 first

Phase 0 builds the two things every later phase depends on and that don't exist yet: **per-user memory** (makes it personal) and a **generalized write/audit substrate** (makes per-role execution safe to fan out). Neither touches the model loop's correctness; both are additive and flag-gated. Nothing here flips a live write flag.

The 2026 governance literature is blunt that fanning out write actions without an audit + approval substrate is where deployments stall ([Berkeley CMR](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/), [Strata HITL](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)). We build the substrate before the second write tool, not after the tenth.

## Workstreams (independent, parallelizable)

### WS-A — Per-user memory  *(spec: memory-architecture.md)*
Build `server/utils/ai/memory/*`, migration 180, the `remember` tool, the async distiller, and wire retrieval/injection into `aiChatEngine.ts`. Pure cores TDD'd first. Gated by `AI_MEMORY_DISTILL_ENABLED` for the inferred path; explicit `remember` + retrieval can ship on regardless (low risk).

### WS-B — Generalize the write/confirm substrate  *(the Phase-2 enabler)*
**Problem:** `confirm-action.post.ts` is hardwired to `create_task` — `db.createTask`, `proposalToTaskBody`, and a literal "Created task" message. Every new `propose_*` tool currently can't be confirmed. Fix it once.

**Refactor → a tool-executor registry keyed by `tool_name`:**

```
server/utils/ai/executors/
  index.ts        # Map<toolName, ActionExecutor>
  types.ts        # ActionExecutor: { execute(payload, ctx) → {resultRef, summary}, label }
  createTask.ts   # the existing path, extracted verbatim (behavior-preserving)
```

`confirm-action.post.ts` becomes generic: look up `executors[row.tool_name]`, call `execute`, post `summary` to the thread. `executeProposal` already takes an injected `PendingActionDb` — generalize `createTask(payload)` → `execute(payload)` so it's tool-agnostic. **This refactor ships with create_task as the only executor (zero behavior change), proven by the existing tests still passing.** Adding a media-buyer/finance executor later is then a one-file drop-in.

> **Office-aware constraint (from [virtual-office integration](./ai-copilot-virtual-office-integration.md) §1):** WS-B/WS-C must be designed so the **virtual office assistant** reuses this same spine. The office already ships a parallel HITL path (`office_assistant_jobs.approval_required`) and audit (`logOfficeAuditEvent`). Do **not** entrench a second system: the executor registry and `ai_action_audit` must be general enough that office job types (`schedule_meeting`, `send_follow_up`, `summarize_thread`) become executors here, and `office_assistant_watches` stays as a trigger source only. One write/approval/audit spine, product-wide.

### WS-C — Action-audit ledger  *(migration 181)*
`ai_pending_actions` records proposed→executed but lacks a durable, queryable audit trail with rollback affordance. Add:

```sql
-- 181_ai_action_audit.sql
CREATE TABLE IF NOT EXISTS ai_action_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_id    UUID REFERENCES ai_pending_actions(id) ON DELETE SET NULL,
  user_id       UUID NOT NULL,            -- proposer
  confirmed_by  UUID,                     -- approver (may differ for high-risk dual-control later)
  tool_name     TEXT NOT NULL,
  risk_tier     TEXT NOT NULL,            -- auto | confirm | rich_confirm
  payload       JSONB NOT NULL,           -- the resolved action
  result_ref    TEXT,                     -- created/changed entity id
  rollback_ref  TEXT,                     -- token/handle to reverse it, if reversible
  outcome       TEXT NOT NULL,            -- executed | failed | rolled_back
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_user ON ai_action_audit(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_action_audit_tool ON ai_action_audit(tool_name, created_at DESC);
```

Every executor writes one audit row on completion (success or failure). `risk_tier` is declared per tool (new optional field on `AiTool`: `riskTier?: 'auto'|'confirm'|'rich_confirm'`, default `confirm` for `mutates: true`). The ledger is what makes write fan-out auditable and is the data source for an admin "AI actions" view later.

## Task breakdown

| # | Task | WS | Files | Tests |
|---|---|---|---|---|
| 1 | Mig 180 `ai_user_memory` + apply | A | `migrations/180_*.sql` | psql apply verified |
| 2 | `memory/types.ts` + `store.ts` (injected db) | A | new | `store.test.ts` |
| 3 | `memory/retrieve.ts` pure scoring | A | new | `retrieve.test.ts` |
| 4 | `aiVectorize.searchSimilar` optional metadata `filter` (additive) | A | `aiVectorize.ts` | existing pass + filter test |
| 5 | `memory/render.ts` (≤200-token block) | A | new | `render.test.ts` |
| 6 | `remember` tool (explicit capture) | A | `tools/remember.ts`, `tools/index.ts` | `remember.test.ts` |
| 7 | `memory/distill.ts` async inferred (gpt-oss-20b, flag) | A | new | `distill.test.ts` |
| 8 | Wire retrieve+inject+distill into `aiChatEngine.ts` | A | `aiChatEngine.ts` | integration |
| 9 | Extract `executors/createTask.ts` from confirm endpoint (behavior-preserving) | B | new + `confirm-action.post.ts` | existing confirm tests pass |
| 10 | Executor registry + generic confirm dispatch | B | `executors/index.ts`, `pendingActions.ts` | `executors.test.ts` |
| 11 | `riskTier` field on `AiTool` (default logic) | B/C | `toolRegistry.ts` | unit |
| 12 | Mig 181 `ai_action_audit` + apply | C | `migrations/181_*.sql` | psql apply verified |
| 13 | Audit-row write in executor path | C | `executors/*`, confirm endpoint | `audit.test.ts` |
| 14 | Cross-user memory isolation test | A | test | green |

## Execution conventions (this repo)

- **Worktree-isolated** (`.worktrees/...`) — a concurrent session switches branches; never build on the shared `main` checkout. Run `nuxt prepare` before vitest in a fresh worktree.
- **TDD pure cores first** (`retrieve`, `distill`, `render`, scoring) — they're I/O-free by design (mirrors `enrich.ts`, `pendingActions.ts`).
- **Migrations auto-applied** against `.env` `DATABASE_URL` (per CLAUDE.md), additive `IF NOT EXISTS` guards.
- **Server alias discipline** — `~~/server/utils/*`, never `~/`.
- **Pre-commit deep-dive review** + `/code-review high` before merge (catches the kind of overlay/alias bugs prior phases hit).
- **Flags off in prod**; nothing auto-enables. `AI_MEMORY_DISTILL_ENABLED` stays off until residency question (memory spec §9.3) is answered.

## Definition of done

- [ ] Migs 180 + 181 live on prod Neon (additive, dormant).
- [ ] Memory: explicit `remember` + retrieval working; inferred distiller behind flag; isolation test green.
- [ ] Confirm endpoint is tool-agnostic; `create_task` still works identically (regression-proven).
- [ ] Every executed write writes an `ai_action_audit` row.
- [ ] Full suite green, zero new type errors, `/code-review high` clean.
- [ ] No live write flag flipped. No marketing change (internal foundations).

## Risks

| Risk | Mitigation |
|---|---|
| Memory pollution from over-eager distiller | High salience threshold, max-3/turn, dedup, flag-off default |
| Confirm refactor breaks the one working write path | Behavior-preserving extraction; existing confirm tests are the gate |
| Vectorize filter unsupported on binding version | Filter is additive; fall back to post-query filtering on `user_id` if needed |
| Latency from memory retrieval | Reuse the KB-search embedding; top-5/200-token cap; measure before/after |

---

### Sources
- [Governing the Agentic Enterprise (Berkeley CMR)](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/) · [Human-in-the-Loop 2026 (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/) · [Gartner Predicts 2026 (Itential)](https://www.itential.com/resource/analyst-report/gartner-predicts-2026-ai-agents-will-reshape-infrastructure-operations/)
