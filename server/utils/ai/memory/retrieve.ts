import type { UserMemory, ScoredMemory, MemType } from './types'

/**
 * PURE memory scoring + selection (Phase-0 WS-A.3, memory-architecture spec §4).
 *
 * Retrieval injects the top-5 (≤~200 tokens) memories into the prompt. The ranking blends:
 *   final = vectorScore × recency(last_used_at) × TYPE_WEIGHT[mem_type] × salience
 * The vector search + db join live in the orchestration layer (WS-A.8); this file is I/O-free
 * so the ranking math is unit-tested in isolation.
 */

export const TYPE_WEIGHT: Record<MemType, number> = { semantic: 0.6, episodic: 0.3, procedural: 0.1 }
export const RECENCY_HALF_LIFE_DAYS = 30
const DAY_MS = 86_400_000

/** Exponential recency decay, half-life 30d. Never-used (null) → neutral 0.5; future/now → 1. */
export function recency(lastUsedAt: string | null, now: Date): number {
  if (!lastUsedAt) return 0.5
  const days = (now.getTime() - new Date(lastUsedAt).getTime()) / DAY_MS
  if (days <= 0) return 1
  return Math.pow(0.5, days / RECENCY_HALF_LIFE_DAYS)
}

/** Blended relevance score for one memory given its vector-similarity score. */
export function scoreMemory(memory: UserMemory, vectorScore: number, now: Date): number {
  const weight = TYPE_WEIGHT[memory.mem_type] ?? 0.3
  return vectorScore * recency(memory.last_used_at, now) * weight * memory.salience
}

/** ~4 chars/token heuristic — enough to keep the injected block under budget. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface RetrieveCandidate { memory: UserMemory, vectorScore: number }
export interface SelectOpts { maxCount?: number, maxTokens?: number }

/**
 * Rank candidates and greedily select the best that fit the count + token budget. A candidate that
 * would blow the token budget is skipped (not a hard stop) so a smaller, lower-ranked memory can
 * still fill the remaining room. Defaults: 5 memories / 200 tokens.
 */
export function selectTopMemories(candidates: RetrieveCandidate[], now: Date, opts: SelectOpts = {}): ScoredMemory[] {
  const maxCount = opts.maxCount ?? 5
  const maxTokens = opts.maxTokens ?? 200
  const scored: ScoredMemory[] = candidates
    .map(c => ({ memory: c.memory, score: scoreMemory(c.memory, c.vectorScore, now) }))
    .sort((a, b) => b.score - a.score)

  const out: ScoredMemory[] = []
  let tokens = 0
  for (const s of scored) {
    if (out.length >= maxCount) break
    const t = estimateTokens(s.memory.content)
    if (tokens + t > maxTokens) continue
    out.push(s)
    tokens += t
  }
  return out
}
