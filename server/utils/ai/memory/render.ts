import type { ScoredMemory } from './types'
import { estimateTokens } from './retrieve'

/**
 * PURE rendering of selected memories into a compact system-prompt block (Phase-0 WS-A.5).
 * `selectTopMemories` already budgets the set; this re-enforces the token cap defensively and
 * formats. Empty (or nothing that fits) → '' so the caller appends nothing.
 */
export const MEMORY_BLOCK_HEADER = 'What I remember about you:'

export function renderMemoryBlock(memories: ScoredMemory[], maxTokens = 200): string {
  if (memories.length === 0) return ''

  const lines: string[] = []
  let tokens = estimateTokens(MEMORY_BLOCK_HEADER)
  for (const m of memories) {
    const line = `- ${m.memory.content}`
    const t = estimateTokens(line)
    if (tokens + t > maxTokens) break
    lines.push(line)
    tokens += t
  }

  if (lines.length === 0) return ''
  return `${MEMORY_BLOCK_HEADER}\n${lines.join('\n')}`
}
