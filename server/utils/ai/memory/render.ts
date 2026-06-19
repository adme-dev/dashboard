import type { ScoredMemory } from './types'
import { estimateTokens } from './retrieve'

/**
 * PURE rendering of selected memories into a compact system-prompt block (Phase-0 WS-A.5).
 * `selectTopMemories` is the authoritative budget (≤5 / ≤200 content-tokens). This formats that set
 * and keeps a final guard against a pathologically large item — but it budgets on the SAME basis
 * (per-item `content`, not the `- ` prefix) so it can never silently drop a memory that select
 * admitted; the default cap leaves headroom over select's 200 for the header + bullet prefixes.
 * Empty (or nothing that fits) → '' so the caller appends nothing.
 */
export const MEMORY_BLOCK_HEADER = 'What I remember about you:'

export function renderMemoryBlock(memories: ScoredMemory[], maxTokens = 256): string {
  if (memories.length === 0) return ''

  const lines: string[] = []
  let tokens = estimateTokens(MEMORY_BLOCK_HEADER)
  for (const m of memories) {
    // Budget on `content` (matching selectTopMemories) so the two stages agree; render the bullet.
    const t = estimateTokens(m.memory.content)
    if (tokens + t > maxTokens) break
    lines.push(`- ${m.memory.content}`)
    tokens += t
  }

  if (lines.length === 0) return ''
  return `${MEMORY_BLOCK_HEADER}\n${lines.join('\n')}`
}
