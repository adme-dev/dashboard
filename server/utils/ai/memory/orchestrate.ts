import type { H3Event } from 'h3'
import { searchSimilar } from '~~/server/utils/aiVectorize'
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import { getMemoriesByIds, listRecentMemories, stampUsed, upsertMemory, markEmbedded } from './store'
import { selectTopMemories, type RetrieveCandidate } from './retrieve'
import { renderMemoryBlock } from './render'
import { distill, type TurnForDistill } from './distill'
import { indexMemoryVector } from './embed'
import type { UserMemory, UpsertMemoryInput, MemScope, MemType } from './types'

/**
 * Memory orchestration (Phase-0 WS-A.8): turn a user's message into a ≤200-token memory block for
 * the system prompt. Vector recall (filtered by userId) → join rows → fallback to recent → score →
 * render, stamping recency. Deps are injected so the flow is unit-tested (incl. cross-user isolation)
 * without bindings. Fail-safe throughout: any error yields '' so a turn never breaks on memory.
 *
 * ISOLATION INVARIANT: every row is re-checked `user_id === userId` after the join — even if the
 * shared Vectorize index returned a foreign id, it is dropped. A user never sees another's memory.
 */

export interface MemoryDeps {
  search: (event: H3Event | undefined, query: string, topK: number, filter: Record<string, unknown>) => Promise<Array<{ id: string, score: number, metadata: Record<string, string> }>>
  byIds: (ids: string[], userId: string) => Promise<UserMemory[]>
  recent: (userId: string, limit: number) => Promise<UserMemory[]>
  stamp: (ids: string[]) => Promise<void>
  now: () => Date
}

const defaultDeps: MemoryDeps = {
  search: (event, query, topK, filter) => event ? searchSimilar(event, query, topK, filter) : searchSimilar(query, topK, filter),
  byIds: (ids, userId) => getMemoriesByIds(ids, userId),
  recent: (userId, limit) => listRecentMemories(userId, limit),
  stamp: ids => stampUsed(ids),
  now: () => new Date(),
}

export async function buildUserMemoryBlock(
  opts: { userId: string, query: string, event?: H3Event },
  deps: MemoryDeps = defaultDeps,
): Promise<string> {
  const { userId, query, event } = opts
  if (!userId) return ''

  let candidates: RetrieveCandidate[] = []

  // 1. Vector recall, scoped to this user.
  try {
    const matches = await deps.search(event, query, 8, { userId })
    if (matches.length > 0) {
      const scoreById = new Map(matches.map(m => [m.id, m.score]))
      const rows = (await deps.byIds(matches.map(m => m.id), userId)).filter(r => r.user_id === userId) // isolation (query already scopes; belt-and-suspenders)
      candidates = rows.map(r => ({ memory: r, vectorScore: scoreById.get(r.id) ?? 0 }))
    }
  } catch {
    /* fall through to recency fallback */
  }

  // 2. Fallback: most-recent memories (vectorScore 1 → ranks on recency × type × salience).
  if (candidates.length === 0) {
    try {
      const rows = (await deps.recent(userId, 10)).filter(r => r.user_id === userId) // isolation
      candidates = rows.map(r => ({ memory: r, vectorScore: 1 }))
    } catch {
      return ''
    }
  }

  const selected = selectTopMemories(candidates, deps.now())
  if (selected.length === 0) return ''

  // Best-effort recency reinforcement; never block on it.
  void deps.stamp(selected.map(s => s.memory.id)).catch(() => {})

  return renderMemoryBlock(selected)
}

/**
 * Inferred-memory WRITE path (Phase-0 WS-A.8b). After a turn, distill ≤3 durable memories with a
 * cheap model and persist them as `inferred`. Called fire-and-forget AFTER the response (via
 * `runAfterResponse`) and gated by `AI_MEMORY_DISTILL_ENABLED` at the engine — this function holds
 * the logic only. Fail-safe end to end: no userId or empty turn → 0 (model never called); any model
 * or save error is swallowed so a turn is never affected. Deps injected for unit-testing without a
 * model or DB. Returns the number of memories actually saved.
 */
export interface DistillStoreDeps {
  /** Single-shot completion (gpt-oss-20b). */
  complete: (prompt: string) => Promise<string>
  /** Existing memory contents for dedup (most-recent slice). */
  recentContents: (userId: string) => Promise<string[]>
  save: (input: UpsertMemoryInput) => Promise<string>
  /** Index a saved memory for vector recall; returns whether a vector was written. */
  index: (event: H3Event | undefined, row: { id: string, userId: string, scope: MemScope, memType: MemType, content: string }) => Promise<boolean>
}

const defaultDistillStoreDeps: DistillStoreDeps = {
  // The instruction lives in buildDistillPrompt (single source of truth); the system message just
  // pins the JSON-array contract for the model.
  complete: prompt => generateGroqInsight(prompt, {
    model: GROQ_MODELS.REASONING_20B,
    temperature: 0.2,
    maxTokens: 400,
    systemPrompt: 'Reply with ONLY a JSON array, exactly as the user instruction specifies.',
  }),
  // content only — dedup needs the strings, not whole rows (review finding #9).
  recentContents: async userId => (await listRecentMemories(userId, 30)).map(m => m.content),
  save: input => upsertMemory(input),
  index: async (event, row) => {
    const ok = await indexMemoryVector({ event, ...row })
    if (ok) await markEmbedded(row.id, row.id).catch(() => {})
    return ok
  },
}

export async function distillAndStoreMemories(
  opts: { userId: string, turn: TurnForDistill, event?: H3Event },
  deps: DistillStoreDeps = defaultDistillStoreDeps,
): Promise<number> {
  const { userId, turn, event } = opts
  if (!userId || !turn?.userMessage?.trim() || !turn?.assistantMessage?.trim()) return 0

  try {
    const existing = await deps.recentContents(userId).catch(() => [] as string[])
    const candidates = await distill(turn, existing, { complete: deps.complete })

    let saved = 0
    for (const c of candidates) {
      try {
        const id = await deps.save({ userId, memType: c.memType, content: c.content, source: 'inferred', salience: c.salience })
        saved++
        // Index for vector recall (fail-safe inside index()); without this the memory is recency-only.
        void deps.index(event, { id, userId, scope: 'user', memType: c.memType, content: c.content }).catch(() => {})
      } catch {
        // one bad candidate (e.g. constraint race) must not abort the rest
      }
    }
    return saved
  } catch {
    return 0
  }
}
