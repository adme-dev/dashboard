import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_RANKING_CONTRACT,
  compareFusedCrmSearchHits,
  reciprocalRankFusion
} from '~~/server/utils/crm/ranking'

const hit = (entityType: 'person' | 'company' | 'opportunity', entityId: string, title: string) => ({
  entityType,
  entityId,
  title
})

describe('CRM search reciprocal rank fusion v1', () => {
  it('pins every ranking, pool, rank-base, weight, and deduplication constant', () => {
    expect(CRM_SEARCH_RANKING_CONTRACT).toEqual({
      revision: 'rrf-v1',
      dedupeRevision: 'entity-key-best-one-based-rank-v1',
      rankBase: 1,
      k: 60,
      keywordWeight: 1,
      semanticWeight: 0.7,
      keywordPoolLimit: 50,
      semanticPoolLimit: 30,
      finalLimitMaximum: 50
    })
  })

  it('fuses complete pools before applying the final limit', () => {
    const keyword = [
      hit('person', 'a', 'Keyword first'),
      hit('company', 'shared', 'Shared keyword')
    ]
    const semantic = [
      hit('opportunity', 'c', 'Semantic first'),
      hit('company', 'shared', 'Shared semantic')
    ]

    const fused = reciprocalRankFusion({ keyword, semantic, finalLimit: 1 })

    expect(fused.map(result => result.key)).toEqual(['company:shared'])
    expect(fused[0]).toMatchObject({ keywordRank: 2, semanticRank: 2 })
  })

  it('deduplicates each source by entity key while retaining its best original one-based rank', () => {
    const firstPerson = hit('person', 'same', 'Best duplicate')
    const laterPerson = hit('person', 'same', 'Later duplicate')
    const company = hit('company', 'next', 'Original rank three')

    const fused = reciprocalRankFusion({
      keyword: [firstPerson, laterPerson, company],
      semantic: [],
      finalLimit: 10
    })

    expect(fused.map(result => result.key)).toEqual(['person:same', 'company:next'])
    expect(fused[0]).toMatchObject({ keywordRank: 1, keywordHit: firstPerson })
    expect(fused[1]).toMatchObject({ keywordRank: 3 })
  })

  it('assigns zero contribution for an absent source list', () => {
    const [semanticOnly] = reciprocalRankFusion({
      keyword: [],
      semantic: [hit('opportunity', 'semantic-only', 'Semantic only')],
      finalLimit: 10
    })

    expect(semanticOnly.keywordRank).toBeNull()
    expect(semanticOnly.semanticRank).toBe(1)
    expect(semanticOnly.keywordContribution).toBe(0)
    expect(semanticOnly.semanticContribution).toBeCloseTo(0.7 / 61, 15)
    expect(semanticOnly.fusedScore).toBeCloseTo(0.7 / 61, 15)
  })

  it('orders by fused score before deterministic tie-break fields', () => {
    const keyword = [
      hit('person', 'keyword-only', 'Keyword only'),
      hit('company', 'both', 'Both keyword')
    ]
    const semantic = [
      hit('opportunity', 'semantic-only', 'Semantic only'),
      hit('company', 'both', 'Both semantic')
    ]

    expect(reciprocalRankFusion({ keyword, semantic, finalLimit: 10 }).map(result => result.key))
      .toEqual(['company:both', 'person:keyword-only', 'opportunity:semantic-only'])
  })

  it('breaks exact score ties by keyword rank, semantic rank, entity type, then entity ID, with absent ranks last', () => {
    const candidates = [
      { key: 'person:z', entityType: 'person' as const, entityId: 'z', fusedScore: 1, keywordRank: null, semanticRank: 1 },
      { key: 'person:b', entityType: 'person' as const, entityId: 'b', fusedScore: 1, keywordRank: 1, semanticRank: null },
      { key: 'opportunity:a', entityType: 'opportunity' as const, entityId: 'a', fusedScore: 1, keywordRank: 1, semanticRank: 2 },
      { key: 'company:b', entityType: 'company' as const, entityId: 'b', fusedScore: 1, keywordRank: 1, semanticRank: 2 },
      { key: 'company:a', entityType: 'company' as const, entityId: 'a', fusedScore: 1, keywordRank: 1, semanticRank: 2 }
    ]

    expect([...candidates].sort(compareFusedCrmSearchHits).map(candidate => candidate.key)).toEqual([
      'company:a',
      'company:b',
      'opportunity:a',
      'person:b',
      'person:z'
    ])
  })

  it('does not trust a caller-provided key over the canonical entity tuple', () => {
    const fused = reciprocalRankFusion({
      keyword: [{ ...hit('person', 'safe-id', 'Safe'), key: 'company:foreign-id' }],
      semantic: [],
      finalLimit: 10
    })

    expect(fused.map(result => result.key)).toEqual(['person:safe-id'])
  })

  it.each([
    ['zero final limit', { keyword: [], semantic: [], finalLimit: 0 }],
    ['oversized final limit', { keyword: [], semantic: [], finalLimit: 51 }],
    ['oversized keyword pool', { keyword: Array.from({ length: 51 }, (_, index) => hit('person', String(index), String(index))), semantic: [], finalLimit: 10 }],
    ['oversized semantic pool', { keyword: [], semantic: Array.from({ length: 31 }, (_, index) => hit('company', String(index), String(index))), finalLimit: 10 }],
    ['unknown entity type', { keyword: [hit('person', 'a', 'A'), { entityType: 'activity', entityId: 'b' }], semantic: [], finalLimit: 10 }]
  ])('fails closed for %s', (_case, input) => {
    expect(() => reciprocalRankFusion(input as never)).toThrow()
  })
})
