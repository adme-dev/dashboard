import { describe, expect, it } from 'vitest'

import {
  siteIntelligenceDomainInputSchema,
  siteIntelligenceIngestBatchSchema
} from '~~/server/utils/siteIntelligence/contracts'

describe('site intelligence contracts', () => {
  it('applies conservative competitor crawl defaults', () => {
    const result = siteIntelligenceDomainInputSchema.parse({
      clientId: '11111111-1111-4111-8111-111111111111',
      lane: 'competitor',
      name: 'Competitor Dealer',
      origin: 'https://competitor.example.com',
      justification: 'Monitor public automotive offers for the approved client set.'
    })

    expect(result).toMatchObject({
      lane: 'competitor',
      discoveryMode: 'sitemaps',
      renderMode: 'auto',
      pageLimit: 100,
      depth: 2,
      frequency: 'daily',
      crawlPurposes: ['search'],
      aiInputAllowed: false,
      retentionDays: 30
    })
  })

  it('rejects AI training as a crawl purpose', () => {
    const result = siteIntelligenceDomainInputSchema.safeParse({
      clientId: '11111111-1111-4111-8111-111111111111',
      lane: 'owned',
      name: 'Owned Dealer',
      origin: 'https://owned.example.com',
      justification: 'Index the client-owned website.',
      crawlPurposes: ['search', 'ai-train']
    })

    expect(result.success).toBe(false)
  })

  it('rejects oversized workflow ingestion batches', () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      url: `https://dealer.example.com/page-${index}`,
      status: 'completed' as const,
      markdown: '# Dealer page',
      metadata: { status: 200, title: 'Dealer page', url: `https://dealer.example.com/page-${index}` }
    }))

    expect(siteIntelligenceIngestBatchSchema.safeParse({
      batchKey: 'run-1:completed:first',
      records
    }).success).toBe(false)
  })
})
