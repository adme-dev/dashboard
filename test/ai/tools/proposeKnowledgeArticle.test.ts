import { describe, it, expect, vi } from 'vitest'
import {
  proposeKnowledgeArticle, proposalToKnowledgeDraft, knowledgeArticleTool,
  type KnowledgeArticleDeps,
} from '~~/server/utils/ai/tools/proposeKnowledgeArticle'
import { registry } from '~~/server/utils/ai/tools'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx = (role = 'project_manager') => ({ userId: 'u1', userRole: role, conversationId: 'c1', event: { headers: {} } as any }) as ToolContext

const deps = (over: Partial<KnowledgeArticleDeps> = {}): KnowledgeArticleDeps => ({
  propose: vi.fn().mockResolvedValue('prop-1'),
  ...over,
})

const data = (r: any) => { expect(r.ok).toBe(true); return (r as any).data }

describe('proposeKnowledgeArticle', () => {
  it('PROPOSES a KB draft (trimmed) — never publishes', async () => {
    const d = deps()
    const out = data(await proposeKnowledgeArticle({ title: '  Refund SOP  ', content: '  steps...  ', category: 'process' }, ctx(), d))
    expect(out.proposalId).toBe('prop-1')
    expect(out.resolved).toMatchObject({ title: 'Refund SOP', content: 'steps...', category: 'process' })
    expect(d.propose).toHaveBeenCalledTimes(1)
  })

  it('rejects a read-only role and empty title/content without proposing', async () => {
    const d = deps()
    expect((await proposeKnowledgeArticle({ title: 'x', content: 'y' }, ctx('viewer'), d)).ok).toBe(false)
    expect((await proposeKnowledgeArticle({ title: '  ', content: 'y' }, ctx(), d)).ok).toBe(false)
    expect((await proposeKnowledgeArticle({ title: 'x', content: '  ' }, ctx(), d)).ok).toBe(false)
    expect(d.propose).not.toHaveBeenCalled()
  })

  it('is a non-permission-gated mutating tool, registered + in COMMON (every pack can propose KB)', async () => {
    expect(knowledgeArticleTool.mutates).toBe(true)
    expect(knowledgeArticleTool.requiredPermission).toBeUndefined()
    expect(registry.find(t => t.name === 'propose_knowledge_article')).toBeDefined()
    const { PERSONAS } = await import('~~/server/utils/ai/personas')
    expect(PERSONAS.finance!.toolAllowlist).toContain('propose_knowledge_article')
  })
})

describe('proposalToKnowledgeDraft', () => {
  it('maps a proposal + author into the draft insert shape', () => {
    expect(proposalToKnowledgeDraft({ title: 'T', content: 'C', category: 'process' }, 'author-9'))
      .toEqual({ title: 'T', content: 'C', category: 'process', authorId: 'author-9' })
  })
  it('defaults a missing category to null', () => {
    expect(proposalToKnowledgeDraft({ title: 'T', content: 'C' }, 'a').category).toBeNull()
  })
})
