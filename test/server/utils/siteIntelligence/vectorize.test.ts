import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockQueryRows = vi.fn()
const mockExecute = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  execute: (...args: unknown[]) => mockExecute(...args)
}))

const {
  deleteSiteIntelligencePageVector,
  searchSiteIntelligence,
  upsertSiteIntelligencePageVector
} = await import('~~/server/utils/siteIntelligence/vectorize')

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222'
const PAGE_ID = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  mockQueryRows.mockReset()
  mockExecute.mockReset().mockResolvedValue(1)
})

function eventWith(bindings: Record<string, unknown>) {
  return { context: { cloudflare: { env: bindings } } } as NonNullable<
    Parameters<typeof upsertSiteIntelligencePageVector>[1]
  >
}

describe('site intelligence Vectorize boundary', () => {
  it('upserts a 768-dimension embedding with complete tenant metadata', async () => {
    const run = vi.fn(async () => ({ data: [Array.from({ length: 768 }, () => 0.1)] }))
    const upsert = vi.fn(async () => ({ mutationId: 'mutation-1' }))

    await upsertSiteIntelligencePageVector({
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      pageId: PAGE_ID,
      lane: 'competitor',
      pageType: 'offer',
      contentHash: 'a'.repeat(64),
      text: 'Haval H6 $42,990 drive away. Book a test drive.'
    }, eventWith({ AI: { run }, SITE_INTELLIGENCE_VECTORIZE: { upsert } }))

    expect(run).toHaveBeenCalledWith('@cf/baai/bge-base-en-v1.5', {
      text: ['Haval H6 $42,990 drive away. Book a test drive.']
    })
    expect(upsert).toHaveBeenCalledWith([{
      id: PAGE_ID,
      values: expect.any(Array),
      metadata: { clientId: CLIENT_ID, domainId: DOMAIN_ID, lane: 'competitor', pageType: 'offer' }
    }])
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('content_hash = $4'),
      [PAGE_ID, CLIENT_ID, PAGE_ID, 'a'.repeat(64)]
    )
  })

  it('rejects an empty client scope before embedding or querying', async () => {
    await expect(searchSiteIntelligence({ clientId: '', query: 'offers', limit: 5 }, eventWith({})))
      .rejects.toThrow('clientId is required')
  })

  it('filters Vectorize by client then joins matches through tenant-scoped Neon rows', async () => {
    const run = vi.fn(async () => ({ data: [Array.from({ length: 768 }, () => 0.2)] }))
    const query = vi.fn(async () => ({ matches: [
      { id: PAGE_ID, score: 0.91, metadata: { clientId: CLIENT_ID } },
      { id: '44444444-4444-4444-8444-444444444444', score: 0.89, metadata: { clientId: 'foreign' } }
    ] }))
    mockQueryRows.mockResolvedValue([{
      id: PAGE_ID,
      source_url: 'https://dealer.example.com/offers/h6',
      facts: { pageType: 'offer' },
      ai_enrichment: { summary: 'Current H6 offer.' }
    }])

    const result = await searchSiteIntelligence(
      { clientId: CLIENT_ID, query: 'H6 offers', limit: 5 },
      eventWith({ AI: { run }, SITE_INTELLIGENCE_VECTORIZE: { query } })
    )

    expect(query).toHaveBeenCalledWith(expect.any(Array), {
      topK: 5,
      returnMetadata: 'all',
      returnValues: false,
      filter: { clientId: CLIENT_ID }
    })
    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('client_id = $1'),
      [CLIENT_ID, [PAGE_ID, '44444444-4444-4444-8444-444444444444']]
    )
    expect(result).toEqual([{
      pageId: PAGE_ID,
      score: 0.91,
      sourceUrl: 'https://dealer.example.com/offers/h6',
      pageType: 'offer',
      excerpt: 'Current H6 offer.'
    }])
  })

  it('deletes the vector before clearing the tenant-scoped Neon vector id', async () => {
    const order: string[] = []
    const deleteByIds = vi.fn(async () => {
      order.push('vector')
    })
    mockExecute.mockImplementation(async () => {
      order.push('neon')
      return 1
    })
    await deleteSiteIntelligencePageVector(
      { clientId: CLIENT_ID, pageId: PAGE_ID },
      eventWith({ SITE_INTELLIGENCE_VECTORIZE: { deleteByIds } })
    )

    expect(order).toEqual(['vector', 'neon'])
  })
})
