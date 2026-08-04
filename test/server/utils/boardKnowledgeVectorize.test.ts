import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setCfBindings } from '~~/server/utils/email'

const AI_VECTOR = Array.from({ length: 768 }, (_, index) => index / 768)

const {
  BoardKnowledgeVectorizeUnavailableError,
  deleteKnowledgeVectors,
  generateKnowledgeEmbedding,
  knowledgeVectorId,
  queryKnowledgeVectors,
  upsertKnowledgeChunks
} = await import('~~/server/utils/boardKnowledge/vectorize')

beforeEach(() => {
  setCfBindings({})
})

describe('Board Knowledge dedicated Vectorize boundary', () => {
  it('generates a complete embedding without truncating a valid knowledge chunk', async () => {
    const run = vi.fn(async () => ({ data: [AI_VECTOR] }))
    setCfBindings({ AI: { run }, KNOWLEDGE_VECTORIZE: {} })
    const text = `Cashflow policy ${'x'.repeat(2_100)}`

    await expect(generateKnowledgeEmbedding({}, text)).resolves.toEqual(AI_VECTOR)
    expect(run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', { text: [text] })
  })

  it('upserts compact metadata only into KNOWLEDGE_VECTORIZE', async () => {
    const run = vi.fn(async () => ({ data: [AI_VECTOR] }))
    const upsert = vi.fn(async () => ({ mutationId: 'mutation-1' }))
    const sharedUpsert = vi.fn()
    setCfBindings({
      AI: { run },
      KNOWLEDGE_VECTORIZE: { upsert },
      VECTORIZE: { upsert: sharedUpsert }
    })

    const result = await upsertKnowledgeChunks({}, [{
      chunkId: '33333333-3333-4333-8333-333333333333',
      submissionId: '22222222-2222-4222-8222-222222222222',
      articleId: '44444444-4444-4444-8444-444444444444',
      departmentId: '11111111-1111-4111-8111-111111111111',
      chunkIndex: 2,
      contentHash: 'a'.repeat(64),
      scopeKey: 'board:11111111-1111-4111-8111-111111111111',
      heading: 'Cash position',
      pageStart: 2,
      content: 'Opening cash position and committed payables.'
    }])

    const vectorId = knowledgeVectorId('33333333-3333-4333-8333-333333333333', 'a'.repeat(64))
    expect(vectorId.length).toBeLessThanOrEqual(64)
    expect(result).toEqual([{ chunkId: '33333333-3333-4333-8333-333333333333', vectorId }])
    expect(upsert).toHaveBeenCalledWith([{
      id: vectorId,
      values: AI_VECTOR,
      metadata: {
        type: 'knowledge_chunk',
        scopeKey: 'board:11111111-1111-4111-8111-111111111111',
        chunkId: '33333333-3333-4333-8333-333333333333',
        submissionId: '22222222-2222-4222-8222-222222222222',
        articleId: '44444444-4444-4444-8444-444444444444',
        contentHash: 'a'.repeat(64),
        chunkIndex: 2,
        departmentId: '11111111-1111-4111-8111-111111111111',
        section: 'Cash position',
        pageStart: 2
      }
    }])
    expect(sharedUpsert).not.toHaveBeenCalled()
    expect(JSON.stringify(upsert.mock.calls)).not.toContain('Opening cash position')
  })

  it('deletes only the stored vector ids supplied by Postgres', async () => {
    const deleteByIds = vi.fn(async () => ({ mutationId: 'mutation-2' }))
    setCfBindings({ KNOWLEDGE_VECTORIZE: { deleteByIds } })

    await deleteKnowledgeVectors({}, ['knowledge:chunk-a:hash-a', null, 'knowledge:chunk-b:hash-b'])

    expect(deleteByIds).toHaveBeenCalledWith(['knowledge:chunk-a:hash-a', 'knowledge:chunk-b:hash-b'])
  })

  it('applies scopeKey filters before the bounded topK query', async () => {
    const run = vi.fn(async () => ({ data: [AI_VECTOR] }))
    const query = vi.fn(async () => ({
      matches: [{
        id: 'knowledge:chunk-a:hash-a',
        score: 0.92,
        metadata: { scopeKey: 'agency', chunkId: 'chunk-a' }
      }]
    }))
    setCfBindings({ AI: { run }, KNOWLEDGE_VECTORIZE: { query } })

    const result = await queryKnowledgeVectors({}, {
      query: 'When are supplier bills due?',
      scopeKeys: ['agency', 'board:11111111-1111-4111-8111-111111111111'],
      topK: 12
    })

    expect(query).toHaveBeenCalledWith(AI_VECTOR, {
      topK: 12,
      returnMetadata: 'all',
      returnValues: false,
      filter: {
        scopeKey: {
          $in: ['agency', 'board:11111111-1111-4111-8111-111111111111']
        }
      }
    })
    expect(result).toEqual([{ id: 'knowledge:chunk-a:hash-a', score: 0.92, metadata: { scopeKey: 'agency', chunkId: 'chunk-a' } }])
  })

  it('fails closed when AI or the dedicated index binding is missing', async () => {
    const sharedQuery = vi.fn()
    setCfBindings({ VECTORIZE: { query: sharedQuery } })

    await expect(generateKnowledgeEmbedding({}, 'cashflow'))
      .rejects.toBeInstanceOf(BoardKnowledgeVectorizeUnavailableError)
    await expect(queryKnowledgeVectors({}, { query: 'cashflow', scopeKeys: ['agency'], topK: 5 }))
      .rejects.toMatchObject({ binding: 'KNOWLEDGE_VECTORIZE' })

    const run = vi.fn(async () => ({ data: [AI_VECTOR] }))
    setCfBindings({ AI: { run }, VECTORIZE: { query: sharedQuery } })
    await expect(queryKnowledgeVectors({}, { query: 'cashflow', scopeKeys: ['agency'], topK: 5 }))
      .rejects.toMatchObject({ binding: 'KNOWLEDGE_VECTORIZE' })
    expect(sharedQuery).not.toHaveBeenCalled()

    setCfBindings({ KNOWLEDGE_VECTORIZE: { query: sharedQuery } })
    await expect(queryKnowledgeVectors({}, { query: 'cashflow', scopeKeys: ['agency'], topK: 5 }))
      .rejects.toMatchObject({ binding: 'AI' })
  })
})
