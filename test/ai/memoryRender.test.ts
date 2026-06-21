import { describe, it, expect } from 'vitest'
import { renderMemoryBlock, MEMORY_BLOCK_HEADER } from '~~/server/utils/ai/memory/render'
import type { ScoredMemory, UserMemory } from '~~/server/utils/ai/memory/types'

const sm = (content: string, score = 1): ScoredMemory => ({
  score,
  memory: { id: 'm', user_id: 'u1', scope: 'user', mem_type: 'semantic', content,
    source: 'inferred', salience: 1, embedding_id: null, metadata: {},
    last_used_at: null, created_at: '', updated_at: '' } as UserMemory,
})

describe('renderMemoryBlock', () => {
  it('empty → empty string (no header)', () => {
    expect(renderMemoryBlock([])).toBe('')
  })

  it('renders the header + bullet lines preserving order', () => {
    const out = renderMemoryBlock([sm('prefers ROAS'), sm('reports in AUD')])
    expect(out).toBe(`${MEMORY_BLOCK_HEADER}\n- prefers ROAS\n- reports in AUD`)
  })

  it('stops at the token budget (drops overflow lines)', () => {
    const big = 'x'.repeat(800) // ~200 tokens alone
    const out = renderMemoryBlock([sm('short fact'), sm(big)], 50)
    expect(out).toContain('- short fact')
    expect(out).not.toContain(big)
  })

  it('returns empty when even the first line cannot fit under the header budget', () => {
    const out = renderMemoryBlock([sm('x'.repeat(4000))], 20)
    expect(out).toBe('')
  })
})
