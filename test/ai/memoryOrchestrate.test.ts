import { describe, it, expect, vi } from 'vitest'
import { buildUserMemoryBlock, type MemoryDeps } from '~~/server/utils/ai/memory/orchestrate'
import { MEMORY_BLOCK_HEADER } from '~~/server/utils/ai/memory/render'
import type { UserMemory } from '~~/server/utils/ai/memory/types'

const NOW = new Date('2026-06-19T00:00:00Z')
const row = (id: string, userId: string, content: string): UserMemory => ({
  id, user_id: userId, scope: 'user', mem_type: 'semantic', content,
  source: 'inferred', salience: 1, embedding_id: null, metadata: {},
  last_used_at: NOW.toISOString(), created_at: '', updated_at: '',
})

const deps = (over: Partial<MemoryDeps> = {}): MemoryDeps => ({
  search: vi.fn().mockResolvedValue([]),
  byIds: vi.fn().mockResolvedValue([]),
  recent: vi.fn().mockResolvedValue([]),
  stamp: vi.fn().mockResolvedValue(undefined),
  now: () => NOW,
  ...over,
})

describe('buildUserMemoryBlock', () => {
  it('renders a block from vector hits for the user', async () => {
    const d = deps({
      search: vi.fn().mockResolvedValue([{ id: 'm1', score: 0.9, metadata: {} }]),
      byIds: vi.fn().mockResolvedValue([row('m1', 'u1', 'reports Acme in AUD')]),
    })
    const out = await buildUserMemoryBlock({ userId: 'u1', query: 'acme' }, d)
    expect(out).toContain(MEMORY_BLOCK_HEADER)
    expect(out).toContain('- reports Acme in AUD')
    // scoped the vector search to the user
    expect((d.search as any).mock.calls[0][3]).toEqual({ userId: 'u1' })
  })

  it('ISOLATION: drops any row whose user_id != caller, even if returned by the index', async () => {
    const d = deps({
      search: vi.fn().mockResolvedValue([{ id: 'm1', score: 0.9, metadata: {} }, { id: 'mX', score: 0.95, metadata: {} }]),
      byIds: vi.fn().mockResolvedValue([row('m1', 'u1', 'mine'), row('mX', 'u2', 'SOMEONE ELSE secret')]),
    })
    const out = await buildUserMemoryBlock({ userId: 'u1', query: 'x' }, d)
    expect(out).toContain('- mine')
    expect(out).not.toContain('SOMEONE ELSE secret')
  })

  it('falls back to recent memories when the vector search is empty', async () => {
    const d = deps({
      search: vi.fn().mockResolvedValue([]),
      recent: vi.fn().mockResolvedValue([row('r1', 'u1', 'prefers ROAS')]),
    })
    const out = await buildUserMemoryBlock({ userId: 'u1', query: 'x' }, d)
    expect(out).toContain('- prefers ROAS')
    expect(d.recent).toHaveBeenCalledWith('u1', 10)
  })

  it('empty everywhere → empty string', async () => {
    expect(await buildUserMemoryBlock({ userId: 'u1', query: 'x' }, deps())).toBe('')
  })

  it('no userId → empty (never runs unscoped)', async () => {
    const d = deps()
    expect(await buildUserMemoryBlock({ userId: '', query: 'x' }, d)).toBe('')
    expect(d.search).not.toHaveBeenCalled()
  })

  it('stamps recency on the selected memories', async () => {
    const d = deps({
      search: vi.fn().mockResolvedValue([{ id: 'm1', score: 0.9, metadata: {} }]),
      byIds: vi.fn().mockResolvedValue([row('m1', 'u1', 'a fact')]),
    })
    await buildUserMemoryBlock({ userId: 'u1', query: 'x' }, d)
    expect(d.stamp).toHaveBeenCalledWith(['m1'])
  })

  it('survives a search error by falling back, never throws', async () => {
    const d = deps({
      search: vi.fn().mockRejectedValue(new Error('vectorize down')),
      recent: vi.fn().mockResolvedValue([row('r1', 'u1', 'fallback fact')]),
    })
    const out = await buildUserMemoryBlock({ userId: 'u1', query: 'x' }, d)
    expect(out).toContain('- fallback fact')
  })
})
