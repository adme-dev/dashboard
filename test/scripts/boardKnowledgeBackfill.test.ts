import { describe, expect, it, vi } from 'vitest'
import {
  buildAgencyKnowledgeChunks,
  runBoardKnowledgeBackfill
} from '../../scripts/board-knowledge-backfill'

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111'

function article(id = ARTICLE_ID, content = 'Supplier invoices are reviewed each Friday.') {
  return {
    id,
    title: 'Accounts payable policy',
    content,
    updatedAt: '2026-08-04T00:00:00.000Z'
  }
}

function dependencies(articles = [article()]) {
  const prepared = new Map<string, ReturnType<typeof buildAgencyKnowledgeChunks>>()
  return {
    listArticles: vi.fn(async (afterId: string | null, limit: number) => {
      const available = afterId ? articles.filter(item => item.id > afterId) : articles
      return available.slice(0, limit)
    }),
    loadChunks: vi.fn(async (articleId: string) => prepared.get(articleId) || []),
    prepareChunks: vi.fn(async (input: ReturnType<typeof article>, chunks: ReturnType<typeof buildAgencyKnowledgeChunks>) => {
      prepared.set(input.id, chunks.map(chunk => ({ ...chunk, vectorId: null })))
      return { chunks: prepared.get(input.id)!, staleVectorIds: [] }
    }),
    upsertChunks: vi.fn(async (_context: unknown, chunks: ReturnType<typeof buildAgencyKnowledgeChunks>) => chunks.map(chunk => ({
      chunkId: chunk.id,
      vectorId: `k:${chunk.id}:${chunk.contentHash.slice(0, 16)}`
    }))),
    deleteVectors: vi.fn(async (_context: unknown, ids: string[]) => ids.length),
    persistVectors: vi.fn(async (articleId: string, vectors: Array<{ chunkId: string, vectorId: string }>) => {
      const current = prepared.get(articleId) || []
      prepared.set(articleId, current.map(chunk => ({
        ...chunk,
        vectorId: vectors.find(vector => vector.chunkId === chunk.id)?.vectorId || null
      })))
      return { expected: current.length, indexed: vectors.length }
    })
  }
}

describe('Board Knowledge agency backfill', () => {
  it('refuses every mode without the explicit acknowledgement', async () => {
    const deps = dependencies()
    await expect(runBoardKnowledgeBackfill({ acknowledged: false, dryRun: true }, deps))
      .rejects.toThrow('BOARD_KNOWLEDGE_BACKFILL_ACK=true')
    expect(deps.listArticles).not.toHaveBeenCalled()
  })

  it('creates deterministic agency-scoped chunks and reports a mutation-free dry run', async () => {
    const first = buildAgencyKnowledgeChunks(article())
    const second = buildAgencyKnowledgeChunks(article())
    expect(second).toEqual(first)
    expect(first[0]).toMatchObject({
      articleId: ARTICLE_ID,
      scopeKey: 'agency',
      chunkIndex: 0,
      vectorId: null
    })

    const deps = dependencies()
    const report = await runBoardKnowledgeBackfill({ acknowledged: true, dryRun: true }, deps)

    expect(report).toMatchObject({ articlesScanned: 1, planned: 1, indexed: 0, parity: true })
    expect(deps.prepareChunks).not.toHaveBeenCalled()
    expect(deps.upsertChunks).not.toHaveBeenCalled()
  })

  it('skips matching indexed hashes and processes work in bounded, restart-safe batches', async () => {
    const first = article('11111111-1111-4111-8111-111111111111')
    const second = article('22222222-2222-4222-8222-222222222222', 'A '.repeat(3_000))
    const deps = dependencies([first, second])
    const firstChunks = buildAgencyKnowledgeChunks(first).map(chunk => ({ ...chunk, vectorId: `stored:${chunk.id}` }))
    deps.loadChunks.mockImplementation(async (articleId: string) => {
      if (articleId === first.id) return firstChunks
      const preparedCall = deps.prepareChunks.mock.calls.find(call => call[0].id === articleId)
      if (!preparedCall) return []
      const expected = preparedCall[1]
      return expected.map(chunk => ({
        ...chunk,
        vectorId: `k:${chunk.id}:${chunk.contentHash.slice(0, 16)}`
      }))
    })

    const report = await runBoardKnowledgeBackfill({
      acknowledged: true,
      dryRun: false,
      articleBatchSize: 1,
      vectorBatchSize: 2
    }, deps)

    expect(deps.listArticles.mock.calls.every(call => call[1] === 1)).toBe(true)
    expect(deps.prepareChunks).toHaveBeenCalledTimes(1)
    expect(deps.upsertChunks.mock.calls.every(call => call[1].length <= 2)).toBe(true)
    expect(report).toMatchObject({ articlesScanned: 2, skipped: 1, indexed: 1, parity: true })
    expect(report.chunksIndexed).toBe(report.chunksExpected)

    const rerun = await runBoardKnowledgeBackfill({ acknowledged: true, dryRun: false }, deps)
    expect(rerun.skipped).toBe(2)
    expect(rerun.indexed).toBe(0)
  })

  it('fails the run when persisted vector parity is incomplete', async () => {
    const deps = dependencies()
    deps.persistVectors.mockResolvedValueOnce({ expected: 2, indexed: 1 })

    await expect(runBoardKnowledgeBackfill({ acknowledged: true, dryRun: false }, deps))
      .rejects.toThrow('agency_knowledge_vector_parity_failed')
  })
})
