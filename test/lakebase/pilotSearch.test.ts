import { describe, expect, it, vi } from 'vitest'
import {
  buildBm25PilotSearchQuery,
  buildLegacyPilotSearchQuery,
  normalizeBm25Rank,
  searchBm25Pilot,
  searchLegacyPilot
} from '../../scripts/lakebase-pilot/search'

const CLIENT = '10000000-0000-4000-8000-000000000001'

describe('Lakebase pilot CRM search query builders', () => {
  it.each([buildLegacyPilotSearchQuery, buildBm25PilotSearchQuery])(
    'parameterises query, client, and limit and filters the client before ranking',
    (build) => {
      const built = build(CLIENT, 'electric fleet', 20)

      expect(built?.params).toEqual(['electric fleet', CLIENT, 20])
      expect(built?.sql).not.toContain('electric fleet')
      expect(built?.sql).toMatch(/WHERE\s+client_id\s*=\s*\$2/i)
      expect(built?.sql).toContain('LIMIT $3')
    }
  )

  it('uses the schema-qualified BM25 index and ascending raw score', () => {
    const built = buildBm25PilotSearchQuery(CLIENT, 'proposal', 20)

    expect(built?.sql).toContain('\'lakebase_pilot.crm_search_documents_bm25_idx\'')
    expect(built?.sql).toContain('<@>')
    expect(built?.sql).toMatch(/ORDER BY\s+raw_score ASC/i)
  })

  it.each([buildLegacyPilotSearchQuery, buildBm25PilotSearchQuery])(
    'returns no query for blank text and clamps limits to one through fifty',
    (build) => {
      expect(build(CLIENT, '   ', 20)).toBeNull()
      expect(build(CLIENT, 'electric', 0)?.params[2]).toBe(1)
      expect(build(CLIENT, 'electric', 99)?.params[2]).toBe(50)
    }
  )
})

describe('Lakebase pilot CRM search adapters', () => {
  it('returns no legacy search hits for blank text', async () => {
    const query = vi.fn()

    await expect(searchLegacyPilot({ query }, CLIENT, '  ', 20)).resolves.toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('maps GIN rows to the public CRM hit contract', async () => {
    const query = vi.fn().mockResolvedValue([{
      type: 'opportunity',
      id: '20000000-0000-4000-8000-000000000001',
      title: 'Electric fleet proposal',
      subtitle: 'open',
      raw_score: 0.75
    }])

    await expect(searchLegacyPilot({ query }, CLIENT, 'electric', 20)).resolves.toEqual([{
      type: 'opportunity',
      id: '20000000-0000-4000-8000-000000000001',
      title: 'Electric fleet proposal',
      subtitle: 'open',
      rank: 0.75
    }])
  })

  it('runs BM25 prefilter and query inside one transaction', async () => {
    const query = vi.fn().mockResolvedValue([])
    const transaction = vi.fn(async callback => callback(query))

    await searchBm25Pilot({ transaction }, CLIENT, 'proposal', 20)

    expect(query.mock.calls[0][0]).toBe('SET LOCAL lakebase_bm25.prefilter = on')
    expect(query.mock.calls[1][0]).toContain('lakebase_pilot.crm_search_documents')
    expect(transaction).toHaveBeenCalledOnce()
  })

  it('returns no BM25 search hits for blank text', async () => {
    const transaction = vi.fn()

    await expect(searchBm25Pilot({ transaction }, CLIENT, '\t', 20)).resolves.toEqual([])
    expect(transaction).not.toHaveBeenCalled()
  })

  it('normalizes more-negative BM25 scores to higher public ranks', () => {
    expect(normalizeBm25Rank(-8)).toBeGreaterThan(normalizeBm25Rank(-2))
    expect(normalizeBm25Rank(-2)).toBeGreaterThan(0)
    expect(normalizeBm25Rank(4)).toBe(0)
  })

  it('maps BM25 rows with the normalized public rank', async () => {
    const query = vi.fn().mockResolvedValue([{
      type: 'company',
      id: '30000000-0000-4000-8000-000000000001',
      title: 'Harbour Electric',
      subtitle: null,
      raw_score: -8
    }])
    const transaction = vi.fn(async callback => callback(query))

    await expect(searchBm25Pilot({ transaction }, CLIENT, 'electric', 20)).resolves.toEqual([{
      type: 'company',
      id: '30000000-0000-4000-8000-000000000001',
      title: 'Harbour Electric',
      subtitle: null,
      rank: 8
    }])
  })
})
