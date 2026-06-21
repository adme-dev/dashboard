import { describe, it, expect, vi } from 'vitest'
import { indexMemoryVector, type IndexMemoryDeps } from '~~/server/utils/ai/memory/embed'

const input = { id: 'mem-1', userId: 'u1', scope: 'user' as const, memType: 'semantic' as const, content: 'reports Acme in AUD' }

const deps = (over: Partial<IndexMemoryDeps> = {}): IndexMemoryDeps => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  upsert: vi.fn().mockResolvedValue(undefined),
  ...over,
})

describe('indexMemoryVector', () => {
  it('embeds the content and upserts a vector keyed by the memory row id with user-scoped metadata', async () => {
    const d = deps()
    const ok = await indexMemoryVector(input, d)
    expect(ok).toBe(true)
    expect(d.embed).toHaveBeenCalledWith(undefined, 'reports Acme in AUD')
    expect(d.upsert).toHaveBeenCalledWith(undefined, 'mem-1', [0.1, 0.2, 0.3], { userId: 'u1', scope: 'user', memType: 'semantic' })
  })

  it('skips the upsert when the embedding is empty (no binding) and reports not-indexed', async () => {
    const d = deps({ embed: vi.fn().mockResolvedValue([]) })
    expect(await indexMemoryVector(input, d)).toBe(false)
    expect(d.upsert).not.toHaveBeenCalled()
  })

  it('is fail-safe — an embed/upsert error yields false, never throws', async () => {
    const d = deps({ embed: vi.fn().mockRejectedValue(new Error('AI down')) })
    expect(await indexMemoryVector(input, d)).toBe(false)
  })

  it('refuses to index without an id, userId, or content (never an unscoped vector)', async () => {
    const d = deps()
    expect(await indexMemoryVector({ ...input, userId: '' }, d)).toBe(false)
    expect(await indexMemoryVector({ ...input, content: '  ' }, d)).toBe(false)
    expect(d.embed).not.toHaveBeenCalled()
  })
})
