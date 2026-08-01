import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockTransaction = vi.fn()

vi.mock('~~/server/utils/db', () => ({
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

const { claimDueSiteIntelligenceDomains } = await import(
  '~~/server/utils/siteIntelligence/scheduler'
)

describe('site intelligence due-domain claim', () => {
  beforeEach(() => {
    mockTransaction.mockReset()
  })

  it('caps the claim, uses one locked update, and maps the next schedule', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{
      domain_id: 'domain-1',
      client_id: 'client-1',
      next_run_at: new Date('2026-08-02T00:00:00.000Z')
    }] })
    mockTransaction.mockImplementation(async callback => callback({ query }))
    const now = new Date('2026-08-01T00:00:00.000Z')

    await expect(claimDueSiteIntelligenceDomains(200, now)).resolves.toEqual([{
      domainId: 'domain-1',
      clientId: 'client-1',
      nextRunAt: '2026-08-02T00:00:00.000Z'
    }])

    expect(query).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF d SKIP LOCKED'), [
      20,
      '2026-08-01T00:00:00.000Z'
    ])
    expect(query.mock.calls[0]?.[0]).toContain('d.status = \'active\'')
    expect(query.mock.calls[0]?.[0]).toContain('r.status IN (\'queued\', \'running\')')
  })
})
