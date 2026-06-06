import { describe, it, expect, vi } from 'vitest'
import { searchKnowledge, knowledgeTool, type KnowledgeDeps, type KnowledgeDoc } from '~~/server/utils/ai/tools/knowledge'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }

function doc(over: Partial<KnowledgeDoc> = {}): KnowledgeDoc {
  return { id: 'd1', score: 0.9, metadata: { title: 'Doc', text: 'body' }, ...over }
}

describe('search_knowledge', () => {
  it('drops documents the caller may not see (ACL filter)', async () => {
    const deps: KnowledgeDeps = {
      search: vi.fn().mockResolvedValue([
        doc({ id: 'visible-1', metadata: { title: 'Public A', visibility: 'public' } }),
        doc({ id: 'secret-1', metadata: { title: 'Secret', visibility: 'private', ownerId: 'someone-else' } }),
        doc({ id: 'visible-2', metadata: { title: 'Public B', visibility: 'public' } }),
      ]),
      // reject any doc flagged private that the caller doesn't own
      canSee: (d, c) => d.metadata.visibility !== 'private' || d.metadata.ownerId === c.userId,
    }
    const res = await searchKnowledge({ query: 'pricing', limit: 5 }, ctx, deps)
    expect(res.ok).toBe(true)
    const items = (res as any).data.items as Array<{ id: string }>
    const ids = items.map(i => i.id)
    expect(ids).toContain('visible-1')
    expect(ids).toContain('visible-2')
    expect(ids).not.toContain('secret-1') // unauthorized doc dropped
  })

  it('respects limit (filtered count is capped after ACL)', async () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      doc({ id: `v${i}`, score: 0.9 - i * 0.01, metadata: { title: `T${i}`, visibility: 'public' } }))
    const deps: KnowledgeDeps = {
      search: vi.fn().mockResolvedValue(many),
      canSee: () => true,
    }
    const res = await searchKnowledge({ query: 'q', limit: 3 }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.items).toHaveLength(3)
    expect((res as any).data.more).toBe(5) // 8 visible - 3 returned
  })

  it('returns a compact { id, title, snippet, score } shape only', async () => {
    const deps: KnowledgeDeps = {
      search: vi.fn().mockResolvedValue([
        doc({ id: 'd1', score: 0.77, metadata: { title: 'How to refund', text: 'Refunds are processed within 5 business days.', secretField: 'do-not-leak' } }),
      ]),
      canSee: () => true,
    }
    const res = await searchKnowledge({ query: 'refunds', limit: 5 }, ctx, deps)
    expect(res.ok).toBe(true)
    const item = (res as any).data.items[0]
    expect(item).toEqual({ id: 'd1', title: 'How to refund', snippet: 'Refunds are processed within 5 business days.', score: 0.77 })
    expect(Object.keys(item).sort()).toEqual(['id', 'score', 'snippet', 'title'])
    expect((item as any).secretField).toBeUndefined()
  })

  it('returns a recoverable error (never throws) when search rejects', async () => {
    const deps: KnowledgeDeps = {
      search: vi.fn().mockRejectedValue(new Error('vectorize down')),
      canSee: () => true,
    }
    const res = await searchKnowledge({ query: 'q', limit: 5 }, ctx, deps)
    expect(res.ok).toBe(false)
    expect((res as any).error).toMatch(/knowledge/i)
  })

  it('is declared untrusted and requires no permission (any authed user)', () => {
    expect(knowledgeTool.returnsUntrusted).toBe(true)
    expect(knowledgeTool.requiredPermission).toBeUndefined()
    expect(knowledgeTool.mutates).toBeUndefined()
  })
})
