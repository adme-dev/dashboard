import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnrich = vi.fn()
vi.mock('~~/server/utils/siteIntelligence/enrich', () => ({
  enrichSiteIntelligencePage: (...args: unknown[]) => mockEnrich(...args)
}))

const { processJob } = await import('~~/server/utils/queueConsumer')

const payload = {
  clientId: '11111111-1111-4111-8111-111111111111',
  domainId: '22222222-2222-4222-8222-222222222222',
  pageId: '33333333-3333-4333-8333-333333333333',
  changeId: '44444444-4444-4444-8444-444444444444',
  contentHash: 'a'.repeat(64)
}

beforeEach(() => {
  mockEnrich.mockReset().mockResolvedValue({ status: 'enriched' })
})

describe('site intelligence queue dispatch', () => {
  it('processes a changed-page enrichment job through the idempotent service', async () => {
    await expect(processJob({
      type: 'site-intelligence.enrich',
      payload,
      enqueuedAt: '2026-08-01T00:00:00.000Z'
    })).resolves.toBeUndefined()
    expect(mockEnrich).toHaveBeenCalledWith(payload)
  })

  it('propagates transient enrichment failures for queue retry', async () => {
    mockEnrich.mockRejectedValue(new Error('R2 unavailable'))
    await expect(processJob({
      type: 'site-intelligence.enrich',
      payload,
      enqueuedAt: '2026-08-01T00:00:00.000Z'
    })).rejects.toThrow('R2 unavailable')
  })
})
