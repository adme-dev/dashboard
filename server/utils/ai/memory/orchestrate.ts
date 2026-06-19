import type { H3Event } from 'h3'
import { searchSimilar } from '~~/server/utils/aiVectorize'
import { getMemoriesByIds, listRecentMemories, stampUsed } from './store'
import { selectTopMemories, type RetrieveCandidate } from './retrieve'
import { renderMemoryBlock } from './render'
import type { UserMemory } from './types'

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
  byIds: (ids: string[]) => Promise<UserMemory[]>
  recent: (userId: string, limit: number) => Promise<UserMemory[]>
  stamp: (ids: string[]) => Promise<void>
  now: () => Date
}

const defaultDeps: MemoryDeps = {
  search: (event, query, topK, filter) => event ? searchSimilar(event, query, topK, filter) : searchSimilar(query, topK, filter),
  byIds: ids => getMemoriesByIds(ids),
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
    const matches = await deps.search(event, query, 20, { userId })
    if (matches.length > 0) {
      const scoreById = new Map(matches.map(m => [m.id, m.score]))
      const rows = (await deps.byIds(matches.map(m => m.id))).filter(r => r.user_id === userId) // isolation
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
