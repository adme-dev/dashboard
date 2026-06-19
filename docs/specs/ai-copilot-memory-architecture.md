# Spec: Personal Co-pilot Memory Architecture (Phase 0)

**Status:** Design — implementation-ready
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md) §6
**Created:** 2026-06-19
**Owner:** Paul Giurin
**Depends on:** existing `server/utils/aiVectorize.ts`, `ai_conversations`/`ai_messages`, `ai_feedback` (mig 017)
**Migration range:** 180 (memory tables)

---

## 1. Goal

Make the co-pilot *personal*: it recalls an individual's **facts**, **past interactions**, and **routines** across sessions. This is the single highest-leverage Phase 0 investment — the difference between "a chatbot with our data" and "my assistant who knows how I work."

We adopt the 2026-standard **three memory scopes** ([mem0 State of AI Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026), [MachineLearningMastery: 3 types of long-term memory](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/)):

| Scope | Stores | `type_weight` | Example (media buyer "Sarah") |
|---|---|---|---|
| **semantic** | facts & stable preferences | 0.6 | "Sarah manages Acme + Bunnings, prefers ROAS over CPA, reports in AUD" |
| **episodic** | summarized past interactions | 0.3 | "2026-06-16: Sarah paused Acme retargeting when CPC hit $2.50" |
| **procedural** | learned workflows / routines | 0.1 | "Sarah's Monday routine: sync spend → check pacing → draft client recap" |

## 2. Design principles

1. **Extend, don't rebuild.** Reuse `aiVectorize.ts` (Workers AI `bge-base-en-v1.5`, 768-dim, shared Vectorize index). No new vector DB, no Mem0/Zep dependency in v1 — we study them, we don't adopt them yet.
2. **Postgres is the source of truth; Vectorize is the recall index.** Every memory is a durable row in `ai_user_memory`; its embedding is a derived artifact. If Vectorize is unavailable (dev), memory still works for exact lookups and degrades gracefully (mirrors the existing fail-soft pattern in `aiVectorize.ts`).
3. **Strict `user_id` scoping.** Personalization with privacy separation: `u123` never sees `u456`'s memory. Org-shared memory (e.g. agency-wide facts) is a distinct, explicit scope.
4. **Bounded injection.** Retrieve top-k≈20, score, inject **top-5 under ~200 tokens** — protects latency and the per-turn budget cap (`AI_LOOP_BUDGET_USD`).
5. **Fail-safe.** Any memory error yields empty context; the loop never breaks (same discipline as `loadOpenProposal`).

## 3. Data model (migration 180)

```sql
-- 180_ai_user_memory.sql
CREATE TABLE IF NOT EXISTS ai_user_memory (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  scope       TEXT NOT NULL DEFAULT 'user',        -- user | org  (org = agency-shared)
  mem_type    TEXT NOT NULL,                        -- semantic | episodic | procedural
  content     TEXT NOT NULL,                        -- the natural-language memory ("Sarah prefers ROAS over CPA")
  source      TEXT NOT NULL DEFAULT 'inferred',     -- inferred | explicit | system
  salience    REAL NOT NULL DEFAULT 0.5,            -- 0..1 importance; decays/reinforces over time
  embedding_id TEXT,                                 -- Vectorize vector id (NULL until embedded)
  metadata    JSONB NOT NULL DEFAULT '{}',          -- e.g. {clientId, entityType, lastSeenTask}
  last_used_at TIMESTAMPTZ,                          -- updated on retrieval (recency signal)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- soft-dedup guard: one row per (user, type, normalized content)
  CONSTRAINT ai_user_memory_uniq UNIQUE (user_id, mem_type, content)
);
CREATE INDEX IF NOT EXISTS idx_ai_user_memory_user      ON ai_user_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_user_memory_user_type ON ai_user_memory(user_id, mem_type);
CREATE INDEX IF NOT EXISTS idx_ai_user_memory_recency   ON ai_user_memory(user_id, last_used_at DESC NULLS LAST);
```

**Vectorize metadata** (per vector, so we can filter at query time):
`{ userId, scope, memType }` — required because the index is shared across KB articles, entities, and now memory.

## 4. Retrieval pipeline

Mirrors the 2026 reference pipeline ([mem0](https://mem0.ai/blog/long-term-memory-ai-agents), [47billion best practices](https://47billion.com/blog/ai-agent-memory-types-implementation-best-practices/)):

```
incoming user message
  → embed (bge-base-en-v1.5, 768d)
  → Vectorize.query(topK=20, filter={ userId, scope IN (user, org) })
  → join back to ai_user_memory rows (drop any not type ∈ memory)
  → score each: final = vectorScore × RECENCY(last_used_at) × TYPE_WEIGHT[mem_type] × salience
  → take top-5, total ≤ ~200 tokens
  → render as a compact "What I remember about you" block in the system prompt
  → stamp last_used_at = NOW() on the retrieved rows (recency reinforcement)
```

Scoring constants (tunable, start here):

```ts
const TYPE_WEIGHT = { semantic: 0.6, episodic: 0.3, procedural: 0.1 }
// recency: exponential decay, half-life ~30 days
function recency(lastUsedAt: Date | null, now: Date): number {
  if (!lastUsedAt) return 0.5
  const days = (now.getTime() - lastUsedAt.getTime()) / 86_400_000
  return Math.pow(0.5, days / 30)
}
```

> **Important:** `searchSimilar()` in `aiVectorize.ts` does **not** currently pass a metadata `filter` to `vectorize.query`. Phase 0 adds an optional `filter` param (additive, backward-compatible) so memory recall can scope by `userId`. This is the only change to existing vector code.

## 5. Write path (how memories form)

Two sources, both fail-safe and off the hot path:

### 5.1 Explicit (`source = 'explicit'`)
A new write tool **`remember`** (mutates: false — it's low-risk, write directly, no confirm card needed) lets the user say "remember that I always report Acme in AUD." Also surfaced as a "📌 Remember this" affordance in the chat UI on any assistant message.

### 5.2 Inferred (`source = 'inferred'`)
After a turn completes, an **async post-turn distiller** (cheap `gpt-oss-20b` call, fire-and-forget, never blocks the response) reads the turn and proposes 0–3 candidate memories with `{mem_type, content, salience}`. Dedup against existing rows (the UNIQUE constraint + a similarity check) before insert. This is the same "summarize history into semantic/episodic memory" pattern the literature describes; keep it conservative (high salience threshold) to avoid memory pollution.

Procedural memories are mostly inferred from **repetition** — if the distiller sees the same ordered tool sequence on ≥3 occasions, it writes a procedural routine. (Phase 0 ships semantic + episodic; procedural capture is a fast-follow once we have data to mine.)

## 6. Module layout (new files)

```
server/utils/ai/memory/
  types.ts          # MemoryScope, MemType, UserMemory, RetrievedMemory
  store.ts          # CRUD over ai_user_memory (injected db, unit-testable — mirrors pendingActions.ts)
  retrieve.ts       # PURE scoring (recency × type_weight × salience) + injected vector/db search
  distill.ts        # PURE prompt + tolerant parser; injected gpt-oss-20b call (mirrors enrich.ts pattern)
  render.ts         # PURE: RetrievedMemory[] → ≤200-token system-prompt block
server/utils/ai/tools/remember.ts   # the `remember` tool (explicit capture)
```

Wiring point: `server/utils/aiChatEngine.ts` — where it already loads last-10 messages + `getRelevantPatterns()`, add `retrieveMemory(userId, message)` and concatenate `render(...)` into the system prompt. Post-turn, enqueue `distill(...)` (fire-and-forget; on CF, a `ctx.waitUntil` / queue send, never awaited inline).

## 7. Testing (TDD — pure cores first)

- `retrieve.test.ts` — scoring math: recency decay, type-weight ordering, salience tie-breaks, top-5 cap, ≤200-token budget. **No I/O.**
- `distill.test.ts` — parser tolerance (malformed JSON → []), dedup logic, salience threshold, max-3-candidates. Injected fake LLM.
- `store.test.ts` — UNIQUE upsert (re-remember reinforces salience, doesn't duplicate), user scoping (never returns another user's rows). Injected db.
- `render.test.ts` — token budget, empty → empty string, ordering preserved.
- Integration: a real turn injects memory; a second turn recalls it.

## 8. Privacy, governance, cost

- **Isolation:** every query is `WHERE user_id = $` + Vectorize filter `{userId}`; add a test that asserts cross-user leakage is impossible. Org-scope is opt-in and never carries another individual's private facts.
- **Right to forget:** `DELETE FROM ai_user_memory WHERE user_id=$` + `deleteVector` — wire a "clear my memory" control and an admin offboarding hook.
- **No secrets in memory:** the distiller prompt explicitly forbids storing credentials/PII beyond business-relevant facts; spotlight discipline still applies to any memory derived from untrusted tool output.
- **Cost:** retrieval = 1 embedding/turn (already paid for KB search; reuse). Distillation = 1 cheap `gpt-oss-20b` call/turn, async, capped; gate behind `AI_MEMORY_DISTILL_ENABLED` so it can be turned off instantly.

## 9. Open questions (carried from PRD §13)

1. Vectorize-only vs temporal graph (Zep/Graphiti) for episodic ordering? **Decision: Vectorize-only for v1**; revisit only if recall quality demands graph traversal.
2. Procedural capture — infer from repetition vs explicit definition? **Hybrid; ship inferred-from-repetition as fast-follow.**
3. Memory store residency constraints? **Open — confirm before enabling distillation in prod.**

## 9a. Graph cross-check (graphify, 2026-06-15)

Validated against `graphify-out/graph.json` to confirm reuse, not duplication:

- **Reused nodes are real & well-connected:** `aiVectorize`/`searchSimilar`/`Vectorize` (70/12/80 refs), `pendingActions` (41), `aiChatEngine` (70), `personas` (23), `knowledge` (229). Extending these is correct; none is a fragile leaf.
- **New tables are absent (no overlap):** `ai_user_memory` → 0 hits, `ai_action_audit` → 0 hits. Genuinely net-new.
- **Vectorize surface confirmed:** the graph lists `generateEmbedding, searchSimilar, upsertVector, deleteVector, getAiBinding, getVectorizeBinding` — exactly the module this spec extends (add the `filter` param to `searchSimilar`).
- **⚠️ Naming adjacency:** an existing `MemoryCache` node (`getCached/setCached/invalidatePrefix`) is a **KV-style request cache, NOT user memory**. This spec's `ai/memory/` + `ai_user_memory` are unrelated — do not wire long-term memory through `MemoryCache`.
- **`ai_feedback`** shows 1 ref (a leaf) — consistent with the "partial memory, weakly integrated" assessment; the new memory system supersedes its role.

## 10. Acceptance criteria

- [ ] Mig 180 applied; `ai_user_memory` live.
- [ ] `aiVectorize.searchSimilar` accepts an optional metadata filter (backward-compatible).
- [ ] `remember` tool stores an explicit memory; it is recalled in a later conversation.
- [ ] Inferred distiller writes ≤3 deduped memories/turn, async, behind a flag, never blocking the response.
- [ ] Retrieval injects ≤5 memories / ≤200 tokens, scored by relevance×recency×type×salience.
- [ ] Cross-user isolation test passes.
- [ ] All pure-core tests green; zero new type errors.

---

### Sources
- [State of AI Agent Memory 2026 (mem0)](https://mem0.ai/blog/state-of-ai-agent-memory-2026) · [Long-Term Memory for AI Agents (mem0)](https://mem0.ai/blog/long-term-memory-ai-agents)
- [Beyond Short-term Memory: 3 Types of Long-term Memory (MachineLearningMastery)](https://machinelearningmastery.com/beyond-short-term-memory-the-3-types-of-long-term-memory-ai-agents-need/)
- [AI Agent Memory: Types, Implementation, Best Practices 2026 (47billion)](https://47billion.com/blog/ai-agent-memory-types-implementation-best-practices/)
- [Best AI Agent Memory Systems in 2026 — frameworks compared (Vectorize)](https://vectorize.io/articles/best-ai-agent-memory-systems)
