import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the shared Vectorize index and the DB so we can drive the REAL default search path
// (the one production uses) and prove it is fail-closed. The existing knowledge.test.ts only
// exercises injected deps, so it never caught the default path leaking non-KB vectors.
vi.mock('~~/server/utils/aiVectorize', () => ({ searchSimilar: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ queryRows: vi.fn() }))

import { searchSimilar } from '~~/server/utils/aiVectorize'
import { queryRows } from '~~/server/utils/db'
import {
  kbArticleRefsFromMatches,
  defaultSearch,
  searchKnowledge,
  defaultCanSee,
} from '~~/server/utils/ai/tools/knowledge'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'producer', event: {} as any }

// A realistic slice of the SHARED Vectorize index: financial summaries, learned Q&A (a verbatim
// user message), an internal task, plus two KB articles — one published, one not.
const MIXED_INDEX = [
  { id: 'fin-pnl-2026-Q2', score: 0.99, metadata: { type: 'fin-pnl', title: 'P&L Summary 2026-Q2' } },
  { id: 'fin-cash-2026-06-07', score: 0.98, metadata: { type: 'fin-cash', title: 'Cash Position 2026-06-07' } },
  { id: 'fin-client-acme', score: 0.97, metadata: { type: 'fin-client', title: 'ACME profitability' } },
  { id: 'qa-9', score: 0.96, metadata: { type: 'qa_pair', title: "what's our cash runway and monthly burn" } },
  { id: 'task-7', score: 0.95, metadata: { type: 'task', title: 'Renegotiate ACME retainer down' } },
  { id: 'kb-aaa', score: 0.94, metadata: { type: 'knowledge_article', id: 'aaa', title: 'Refund SOP' } },
  { id: 'kb-bbb', score: 0.93, metadata: { type: 'knowledge_article', id: 'bbb', title: 'Unpublished draft' } },
]

beforeEach(() => {
  vi.mocked(searchSimilar).mockReset()
  vi.mocked(queryRows).mockReset()
})

describe('kbArticleRefsFromMatches (fail-closed type filter)', () => {
  it('drops every non-KB vector type (financial, entity, qa_pair)', () => {
    const nonKb = MIXED_INDEX.filter(m => m.metadata.type !== 'knowledge_article')
    expect(kbArticleRefsFromMatches(nonKb)).toEqual([])
  })

  it('keeps knowledge_article vectors, preserving order and deduping by id', () => {
    const refs = kbArticleRefsFromMatches([
      { id: 'kb-aaa', score: 0.9, metadata: { type: 'knowledge_article', id: 'aaa' } },
      { id: 'kb-bbb', score: 0.8, metadata: { type: 'knowledge_article', id: 'bbb' } },
      { id: 'kb-aaa-dup', score: 0.7, metadata: { type: 'knowledge_article', id: 'aaa' } },
    ])
    expect(refs).toEqual([
      { articleId: 'aaa', score: 0.9 },
      { articleId: 'bbb', score: 0.8 },
    ])
  })

  it('drops a knowledge_article match that carries no article id', () => {
    expect(kbArticleRefsFromMatches([
      { id: 'kb-noid', score: 0.9, metadata: { type: 'knowledge_article' } },
    ])).toEqual([])
  })
})

describe('defaultSearch (real production retrieval path)', () => {
  it('returns ONLY published KB articles — never financial/qa/task vectors — with real body text', async () => {
    vi.mocked(searchSimilar).mockResolvedValue(MIXED_INDEX as any)
    // Source-of-truth re-fetch: only the published article exists; the unpublished one is absent.
    vi.mocked(queryRows).mockResolvedValue([
      { id: 'aaa', title: 'Refund SOP', content: 'Refunds are processed within 5 business days.', category: 'ops' },
    ] as any)

    const docs = await defaultSearch('what is our cash runway and burn', 5, ctx)

    // Exactly one doc — the published KB article. Nothing financial/qa/task leaks through.
    expect(docs).toHaveLength(1)
    expect(docs[0].id).toBe('aaa')
    expect(docs[0].metadata.text).toBe('Refunds are processed within 5 business days.')
    const leakedTypes = docs.map(d => d.metadata.type)
    expect(leakedTypes).not.toContain('fin-pnl')
    expect(leakedTypes).not.toContain('fin-cash')
    expect(leakedTypes).not.toContain('qa_pair')

    // The DB re-fetch is scoped to KB article ids only — non-KB ids never reach the query.
    expect(queryRows).toHaveBeenCalledTimes(1)
    expect(vi.mocked(queryRows).mock.calls[0][0]).toMatch(/board_knowledge_submission_id IS NULL/)
    const passedIds = vi.mocked(queryRows).mock.calls[0][1] as string[]
    expect(passedIds.sort()).toEqual(['aaa', 'bbb'])
    expect(passedIds).not.toContain('fin-pnl-2026-Q2')
  })

  it('returns [] when the index has no KB articles (only sensitive vectors) — no DB query', async () => {
    vi.mocked(searchSimilar).mockResolvedValue(
      MIXED_INDEX.filter(m => m.metadata.type !== 'knowledge_article') as any,
    )
    const docs = await defaultSearch('cash position', 5, ctx)
    expect(docs).toEqual([])
    expect(queryRows).not.toHaveBeenCalled()
  })
})

describe('searchKnowledge end-to-end on default deps (no injected deps)', () => {
  it('a non-FINANCE caller cannot pull financial summaries via the knowledge tool', async () => {
    vi.mocked(searchSimilar).mockResolvedValue(MIXED_INDEX as any)
    vi.mocked(queryRows).mockResolvedValue([
      { id: 'aaa', title: 'Refund SOP', content: 'Refunds processed within 5 business days.', category: 'ops' },
    ] as any)

    const res = await searchKnowledge({ query: 'cash runway P&L', limit: 5 }, ctx)
    expect(res.ok).toBe(true)
    const items = (res as any).data.items as Array<{ id: string, title: string, snippet: string }>
    const titles = items.map(i => i.title)
    expect(titles).toEqual(['Refund SOP'])
    // None of the financial / qa / task titles surface.
    expect(titles.join(' ')).not.toMatch(/P&L|Cash Position|profitability|runway|retainer/i)
    expect(items[0].snippet).toMatch(/refunds processed/i)
  })
})

describe('defaultCanSee (residual ACL — deliberately fail-OPEN for missing metadata)', () => {
  const kdoc = (metadata: Record<string, string>) => ({ id: 'x', score: 0.9, metadata })
  // ctx.userId = 'u1' (from the shared ctx above); a second ctx carries a client scope.
  const scopedCtx: ToolContext = { userId: 'u1', userRole: 'producer', event: {} as never, clientScope: 'acme' }

  it('FAIL-OPEN: a doc with no visibility/ownerId is visible (KB articles are staff-shared)', () => {
    expect(defaultCanSee(kdoc({ title: 'SOP', text: 'body' }), ctx)).toBe(true)
  })

  it('a public doc is visible', () => {
    expect(defaultCanSee(kdoc({ visibility: 'public' }), ctx)).toBe(true)
  })

  it('hides a private doc owned by someone else', () => {
    expect(defaultCanSee(kdoc({ visibility: 'private', ownerId: 'someone-else' }), ctx)).toBe(false)
  })

  it('shows a private doc owned by the caller', () => {
    expect(defaultCanSee(kdoc({ visibility: 'private', ownerId: 'u1' }), ctx)).toBe(true)
  })

  it('FAIL-OPEN: a private doc with NO ownerId is visible (the guard requires an ownerId)', () => {
    expect(defaultCanSee(kdoc({ visibility: 'private' }), ctx)).toBe(true)
  })

  it('hides a client-scoped doc when the caller is under a different client scope', () => {
    expect(defaultCanSee(kdoc({ clientScope: 'globex' }), scopedCtx)).toBe(false)
  })

  it('shows a client-scoped doc matching the caller scope', () => {
    expect(defaultCanSee(kdoc({ clientScope: 'acme' }), scopedCtx)).toBe(true)
  })

  it('FAIL-OPEN: a client-scoped doc is visible to a caller with no client scope (staff)', () => {
    expect(defaultCanSee(kdoc({ clientScope: 'acme' }), ctx)).toBe(true)
  })
})
