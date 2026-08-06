import { describe, expect, it, vi } from 'vitest'
import { runGoogleAiMaxScheduledScans } from '~~/server/utils/googleAiMaxScheduler'

describe('runGoogleAiMaxScheduledScans', () => {
  it('enumerates tenants explicitly and isolates failures', async () => {
    const loadContext = vi.fn(async ({ tenantId }: { tenantId: string }) => {
      if (tenantId === 'tenant-b') throw new Error('credential unavailable')
      return {
        developerToken: 'developer-token',
        accounts: [{ connectionId: `connection-${tenantId}`, customerId: '123', accessToken: 'token' }],
      }
    })
    const runScan = vi.fn(async ({ tenantId }: { tenantId: string }) => ({
      accepted: true as const,
      run: { id: `run-${tenantId}`, status: 'completed' as const },
      processedConnections: 1,
      totalCampaigns: 2,
      affectedCampaigns: 1,
      unknownCampaigns: 0,
      failures: [],
    }))

    const result = await runGoogleAiMaxScheduledScans({
      observedAt: '2026-08-06T00:00:00.000Z',
    }, {
      listTenants: async () => [{ tenant_id: 'tenant-a' }, { tenant_id: 'tenant-b' }],
      loadContext,
      runScan,
    })

    expect(result).toEqual({
      tenantCount: 2,
      started: 1,
      skipped: 0,
      failed: 1,
      results: [
        { tenantId: 'tenant-a', status: 'completed', runId: 'run-tenant-a' },
        { tenantId: 'tenant-b', status: 'failed', error: 'credential unavailable' },
      ],
    })
    expect(runScan).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: 'tenant-a',
      trigger: 'scheduled',
    }))
  })

  it('skips tenants without scoped Google connections and overlapping runs', async () => {
    const result = await runGoogleAiMaxScheduledScans({}, {
      listTenants: async () => [{ tenant_id: 'tenant-a' }, { tenant_id: 'tenant-b' }],
      loadContext: async ({ tenantId }) => ({
        developerToken: 'developer-token',
        accounts: tenantId === 'tenant-a' ? [] : [{ connectionId: 'connection-b', customerId: '123', accessToken: 'token' }],
      }),
      runScan: async () => ({ accepted: false as const, run: null }),
    })

    expect(result.started).toBe(0)
    expect(result.skipped).toBe(2)
    expect(result.results.map(item => item.status)).toEqual(['no_connections', 'overlap'])
  })
})
