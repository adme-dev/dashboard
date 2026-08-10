import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT,
  buildCrmSearchEmbeddingRequest,
  buildCrmSearchVectorizeQueryOptions,
  filterSemanticMatches,
  parseCrmSearchEmbedding
} from '~~/server/utils/crm/semanticCandidates'

const vectorId = (character: string) => character.repeat(43)

describe('CRM semantic provider candidate boundary', () => {
  it('pins the versioned retrieval constants and exact active-schema-only Vectorize query', () => {
    expect(CRM_SEARCH_SEMANTIC_RETRIEVAL_CONTRACT).toEqual({
      revision: 'crm-search-semantic-retrieval-v1',
      thresholdRevision: 'cosine-0.75-v1',
      modelId: '@cf/baai/bge-base-en-v1.5',
      pooling: 'cls',
      dimensions: 768,
      topK: 30,
      maximumTopK: 50,
      minimumScore: 0.75
    })

    expect(buildCrmSearchVectorizeQueryOptions({
      namespace: vectorId('n'),
      activeSchemaVersion: 'crm-search-v1',
      allowedEntityTypes: ['person', 'company']
    })).toEqual({
      topK: 30,
      namespace: vectorId('n'),
      returnValues: false,
      returnMetadata: 'none',
      filter: {
        schemaVersion: 'crm-search-v1',
        entityType: { $in: ['person', 'company'] }
      }
    })
  })

  it('builds only the approved Workers AI payload and accepts the Task 12 provider response', () => {
    expect(buildCrmSearchEmbeddingRequest('renewal risk accounts')).toEqual({
      text: ['renewal risk accounts'],
      pooling: 'cls'
    })

    const embedding = Array.from({ length: 768 }, (_, index) => index / 768)
    expect(parseCrmSearchEmbedding({
      shape: [1, 768],
      data: [embedding],
      pooling: 'cls'
    })).toEqual(embedding)
    expect(parseCrmSearchEmbedding({
      data: [Float32Array.from(embedding)]
    })).toEqual(Array.from(Float32Array.from(embedding)))
  })

  it.each([
    ['wrong dimensions', { data: [Array(767).fill(0)] }],
    ['multiple vectors', { data: [Array(768).fill(0), Array(768).fill(0)] }],
    ['non-finite component', { data: [[...Array(767).fill(0), Number.NaN]] }],
    ['wrong shape', { shape: [1, 767], data: [Array(768).fill(0)], pooling: 'cls' }],
    ['wrong pooling', { shape: [1, 768], data: [Array(768).fill(0)], pooling: 'mean' }],
    ['unexpected provider fields', { data: [Array(768).fill(0)], query: 'secret' }]
  ])('rejects an untrusted embedding response with %s', (_label, response) => {
    expect(() => parseCrmSearchEmbedding(response)).toThrow()
  })

  it('applies abstention before join-back, rejects malformed matches, and deduplicates by first provider rank', () => {
    expect(filterSemanticMatches([
      { id: vectorId('a'), score: 0.82 },
      { id: vectorId('b'), score: 0.74 },
      { id: vectorId('a'), score: 0.99 },
      { id: vectorId('c'), score: Number.NaN },
      { id: 'not-a-canonical-vector-id', score: 0.98 },
      { id: vectorId('d'), score: 0.75, metadata: { raw: 'must-not-be-used' } }
    ], { minimumScore: 0.75 })).toEqual([
      { vectorId: vectorId('a'), score: 0.82, semanticRank: 1 },
      { vectorId: vectorId('d'), score: 0.75, semanticRank: 6 }
    ])
  })

  it('fails closed on namespace, schema, entity-filter, and provider response drift', () => {
    expect(() => buildCrmSearchVectorizeQueryOptions({
      namespace: 'foreign',
      activeSchemaVersion: 'crm-search-v1',
      allowedEntityTypes: ['person']
    })).toThrow()
    expect(() => buildCrmSearchVectorizeQueryOptions({
      namespace: vectorId('n'),
      activeSchemaVersion: 'crm-search-v0',
      allowedEntityTypes: ['person']
    })).toThrow()
    expect(() => buildCrmSearchVectorizeQueryOptions({
      namespace: vectorId('n'),
      activeSchemaVersion: 'crm-search-v1',
      allowedEntityTypes: ['activity' as never]
    })).toThrow()
    expect(() => filterSemanticMatches({ matches: [] } as never)).toThrow()
    expect(() => filterSemanticMatches(Array.from({ length: 31 }, () => ({
      id: vectorId('a'),
      score: 0.9
    })))).toThrow()
  })
})
