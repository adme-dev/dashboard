import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setCfBindings } from '~~/server/utils/email'
import { prepareSiteIntelligenceSnapshot } from '~~/server/utils/siteIntelligence/storage'

const mockTransaction = vi.fn()

vi.mock('~~/server/utils/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/db')>()
  return { ...actual, transaction: (...args: unknown[]) => mockTransaction(...args) }
})

const { recordSiteIntelligenceIngestBatch } = await import('~~/server/utils/siteIntelligence/repository')

const RUN_ID = '11111111-1111-4111-8111-111111111111'
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '33333333-3333-4333-8333-333333333333'
const PAGE_ID = '44444444-4444-4444-8444-444444444444'
const CHANGE_ID = '55555555-5555-4555-8555-555555555555'
const RAW_MARKDOWN = '# Haval H6 offer\n$42,990 drive away. Book a test drive.'

beforeEach(() => {
  mockTransaction.mockReset()
  setCfBindings({})
})

describe('site intelligence snapshot preparation', () => {
  it('writes a content-hashed snapshot under an exact tenant/run prefix', async () => {
    const put = vi.fn(async (key: string) => ({ key }))
    setCfBindings({ SITE_INTELLIGENCE_BUCKET: { put, delete: vi.fn() } })

    const prepared = await prepareSiteIntelligenceSnapshot(undefined, {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      runId: RUN_ID,
      record: {
        url: 'https://dealer.example.com/offers/h6?utm_source=paid#hero',
        status: 'completed',
        markdown: RAW_MARKDOWN,
        metadata: { url: 'https://dealer.example.com/offers/h6?utm_source=paid#hero', status: 200, title: 'H6 Offer' }
      }
    })

    expect(prepared.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(prepared.canonicalUrl).toBe('https://dealer.example.com/offers/h6')
    expect(prepared.r2ObjectKey).toBe(
      `clients/${CLIENT_ID}/domains/${DOMAIN_ID}/runs/${RUN_ID}/${prepared.contentHash}.md`
    )
    expect(put).toHaveBeenCalledWith(prepared.r2ObjectKey, RAW_MARKDOWN, {
      httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
      customMetadata: {
        clientId: CLIENT_ID,
        domainId: DOMAIN_ID,
        runId: RUN_ID,
        contentHash: prepared.contentHash
      }
    })
    expect(JSON.stringify(prepared.metadata)).not.toContain(RAW_MARKDOWN)
  })
})

describe('atomic site intelligence batch ingestion', () => {
  const prepared = {
    canonicalUrl: 'https://dealer.example.com/offers/h6',
    sourceUrl: 'https://dealer.example.com/offers/h6',
    status: 'completed' as const,
    httpStatus: 200,
    title: 'H6 Offer',
    contentHash: 'a'.repeat(64),
    r2ObjectKey: `clients/${CLIENT_ID}/domains/${DOMAIN_ID}/runs/${RUN_ID}/${'a'.repeat(64)}.md`,
    metadata: { url: 'https://dealer.example.com/offers/h6', status: 200, title: 'H6 Offer' },
    facts: {
      pageType: 'offer' as const,
      brand: 'GWM', model: 'Haval H6', variant: null, bodyType: null, powertrain: null,
      modelYear: null, stockState: null, driveAwayPrice: 42990, driveAwayPriceDisplay: '$42,990',
      listPrice: null, listPriceDisplay: null, discount: null, discountDisplay: null,
      offerTypes: ['price'],
      finance: {
        deposit: null, depositDisplay: null, repayment: null, repaymentDisplay: null,
        repaymentPeriod: null, comparisonRate: null, comparisonRateDisplay: null,
        termMonths: null, termDisplay: null, balloon: null, balloonDisplay: null, eligibility: null
      },
      expiry: null, ctas: ['test_drive'], disclaimers: []
    },
    evidence: [{ field: 'driveAwayPrice', excerpt: '$42,990 drive away' }],
    extractionVersion: 'automotive-deterministic-v1'
  }

  it('inserts one material page/change and returns one enrichment job, then replays without another', async () => {
    const firstQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID, lane: 'competitor' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'batch-1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: PAGE_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: CHANGE_ID }] })
      .mockResolvedValueOnce({ rows: [] })
    const replayQuery = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID, lane: 'competitor' }] })
      .mockResolvedValueOnce({ rows: [] })
    mockTransaction
      .mockImplementationOnce(async callback => callback({ query: firstQuery }))
      .mockImplementationOnce(async callback => callback({ query: replayQuery }))

    const input = { clientId: CLIENT_ID, domainId: DOMAIN_ID, batchKey: 'batch-1', records: [prepared] }
    const first = await recordSiteIntelligenceIngestBatch(RUN_ID, input)
    const replay = await recordSiteIntelligenceIngestBatch(RUN_ID, input)

    expect(first).toEqual({
      replayed: false,
      enrichmentJobs: [{ clientId: CLIENT_ID, domainId: DOMAIN_ID, pageId: PAGE_ID, changeId: CHANGE_ID, contentHash: 'a'.repeat(64) }]
    })
    expect(replay).toEqual({ replayed: true, enrichmentJobs: [] })
    const changeCall = firstQuery.mock.calls.find(call => String(call[0]).includes('INSERT INTO site_intelligence_changes'))
    expect(changeCall).toBeDefined()
    expect(JSON.stringify(changeCall?.[1])).not.toContain(RAW_MARKDOWN)
  })

  it('updates last-seen state without a change or enrichment job when only non-material content changed', async () => {
    const existing = {
      id: PAGE_ID,
      content_hash: 'b'.repeat(64),
      facts: prepared.facts
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID, lane: 'competitor' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'batch-2' }] })
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [{ id: PAGE_ID }] })
      .mockResolvedValueOnce({ rows: [] })
    mockTransaction.mockImplementation(async callback => callback({ query }))

    const result = await recordSiteIntelligenceIngestBatch(RUN_ID, {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      batchKey: 'batch-2',
      records: [{ ...prepared, contentHash: 'c'.repeat(64), r2ObjectKey: prepared.r2ObjectKey.replace(/a{64}/, 'c'.repeat(64)) }]
    })

    expect(result).toEqual({ replayed: false, enrichmentJobs: [] })
    expect(query.mock.calls.some(call => String(call[0]).includes('INSERT INTO site_intelligence_changes'))).toBe(false)
    const pageUpdate = query.mock.calls.find(call => String(call[0]).includes('UPDATE site_intelligence_pages'))
    expect(pageUpdate?.[1]?.at(-1)).toBe(false)
  })

  it('appends one change and enrichment job for an existing page with a material new hash', async () => {
    const existing = {
      id: PAGE_ID,
      content_hash: 'b'.repeat(64),
      facts: { ...prepared.facts, driveAwayPrice: 41990, driveAwayPriceDisplay: '$41,990' }
    }
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ id: RUN_ID, lane: 'competitor' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'batch-3' }] })
      .mockResolvedValueOnce({ rows: [existing] })
      .mockResolvedValueOnce({ rows: [{ id: PAGE_ID }] })
      .mockResolvedValueOnce({ rows: [{ id: CHANGE_ID }] })
      .mockResolvedValueOnce({ rows: [] })
    mockTransaction.mockImplementation(async callback => callback({ query }))

    const result = await recordSiteIntelligenceIngestBatch(RUN_ID, {
      clientId: CLIENT_ID,
      domainId: DOMAIN_ID,
      batchKey: 'batch-3',
      records: [prepared]
    })

    expect(result).toEqual({
      replayed: false,
      enrichmentJobs: [{ clientId: CLIENT_ID, domainId: DOMAIN_ID, pageId: PAGE_ID, changeId: CHANGE_ID, contentHash: 'a'.repeat(64) }]
    })
    const pageUpdate = query.mock.calls.find(call => String(call[0]).includes('UPDATE site_intelligence_pages'))
    expect(pageUpdate?.[1]?.at(-1)).toBe(true)
    const changeCall = query.mock.calls.find(call => String(call[0]).includes('INSERT INTO site_intelligence_changes'))
    expect(JSON.parse(changeCall?.[1]?.[8] as string)).toMatchObject({
      material: true,
      changedFields: ['driveAwayPrice']
    })
  })
})
