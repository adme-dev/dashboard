import { describe, expect, it, vi } from 'vitest'
import {
  CRM_SEARCH_SHADOW_CONTRACT,
  runCrmShadowSearch
} from '~~/server/utils/crm/shadowSearch'

const context = {
  organisationScopeId: '20000000-0000-4000-8000-000000000001',
  clientId: '20000000-0000-4000-8000-000000000002',
  correlationId: '20000000-0000-4000-8000-000000000003',
  actorType: 'staff' as const,
  actorId: '20000000-0000-4000-8000-000000000004',
  surface: 'agency_global' as const,
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: false }
}

const request = {
  clientId: context.clientId,
  query: 'renewal risk',
  limit: 10,
  semanticEligible: true
}

const keyword = [{
  type: 'company' as const,
  id: '20000000-0000-4000-8000-000000000005',
  title: 'Acme',
  subtitle: null,
  rank: 1
}]

describe('CRM agency-global shadow retrieval', () => {
  it('pins the unbiased sampling and bounded background contract', () => {
    expect(CRM_SEARCH_SHADOW_CONTRACT).toEqual({
      revision: 'crm-search-shadow-v1',
      maximumSampleRate: 0.1,
      maximumConcurrent: 4
    })
  })

  it('returns the exact visible keyword ordering without awaiting sampled semantic work', async () => {
    let resolveSemantic!: () => void
    const semantic = new Promise<void>((resolve) => {
      resolveSemantic = resolve
    })
    const runBackgroundTask = vi.fn()
    const result = runCrmShadowSearch({ context, request, keyword }, {
      sample: () => 0.05,
      captureBindings: () => ({ workersAi: { binding: 'ai' }, vectorize: { binding: 'vector' } }),
      retrieveSemantic: vi.fn(() => semantic),
      runBackgroundTask
    })

    expect(result).toEqual({ results: keyword, mode: 'shadow' })
    expect(runBackgroundTask).toHaveBeenCalledTimes(1)
    expect(runBackgroundTask).toHaveBeenCalledWith(expect.any(Promise), {
      label: 'crm-search-shadow',
      correlationId: context.correlationId
    })
    resolveSemantic()
    await semantic
  })

  it('honors the public result limit without truncating the background keyword pool', () => {
    const keywordPool = [
      keyword[0]!,
      {
        type: 'person' as const,
        id: '20000000-0000-4000-8000-000000000006',
        title: 'Alice',
        subtitle: null,
        rank: 0.9
      }
    ]
    const retrieveSemantic = vi.fn().mockResolvedValue(undefined)

    const result = runCrmShadowSearch({
      context,
      request: { ...request, limit: 1 },
      keyword: keywordPool
    }, {
      sample: () => 0,
      captureBindings: () => ({ workersAi: {}, vectorize: {} }),
      retrieveSemantic,
      runBackgroundTask: vi.fn()
    })

    expect(result).toEqual({ results: [keywordPool[0]], mode: 'shadow' })
    expect(retrieveSemantic).toHaveBeenCalledTimes(1)
  })

  it('captures provider bindings synchronously before response/background scheduling', () => {
    const order: string[] = []
    runCrmShadowSearch({ context, request, keyword }, {
      sample: () => 0,
      captureBindings: () => {
        order.push('capture')
        return { workersAi: {}, vectorize: {} }
      },
      retrieveSemantic: vi.fn(async () => {
        order.push('semantic')
      }),
      runBackgroundTask: vi.fn(() => {
        order.push('waitUntil')
      })
    })

    expect(order).toEqual(['capture', 'semantic', 'waitUntil'])
  })

  it('samples no more than ten percent and skips privacy-ineligible/provider-disabled requests', () => {
    for (const [sample, semanticEligible, providerEnabled, expectedCalls] of [
      [0.099999, true, true, 1],
      [0.1, true, true, 0],
      [0.01, false, true, 0],
      [0.01, true, false, 0]
    ] as const) {
      const captureBindings = vi.fn(() => ({ workersAi: {}, vectorize: {} }))
      const retrieveSemantic = vi.fn().mockResolvedValue(undefined)
      const runBackgroundTask = vi.fn()
      runCrmShadowSearch({
        context,
        request: { ...request, semanticEligible },
        keyword,
        providerEnabled
      }, {
        sample: () => sample,
        captureBindings,
        retrieveSemantic,
        runBackgroundTask
      })
      expect(retrieveSemantic).toHaveBeenCalledTimes(expectedCalls)
      expect(runBackgroundTask).toHaveBeenCalledTimes(expectedCalls)
      expect(captureBindings).toHaveBeenCalledTimes(expectedCalls)
    }
  })

  it('does not retain the raw query in waitUntil metadata or emit it to logs on background failure', async () => {
    const runBackgroundTask = vi.fn()
    const log = vi.fn()
    runCrmShadowSearch({ context, request, keyword }, {
      sample: () => 0,
      captureBindings: () => ({ workersAi: {}, vectorize: {} }),
      retrieveSemantic: vi.fn().mockRejectedValue(new Error(`provider echoed ${request.query}`)),
      runBackgroundTask,
      log
    })

    const [background, metadata] = runBackgroundTask.mock.calls[0]!
    await expect(background).resolves.toBeUndefined()
    expect(JSON.stringify(metadata)).not.toContain(request.query)
    expect(JSON.stringify(log.mock.calls)).not.toContain(request.query)
    expect(log).toHaveBeenCalledWith({
      event: 'crm_search_shadow_failed',
      correlationId: context.correlationId,
      status: 'provider_failure'
    })
  })

  it('preserves visible keyword results when background registration fails', async () => {
    const log = vi.fn()

    expect(runCrmShadowSearch({ context, request, keyword }, {
      sample: () => 0,
      captureBindings: () => ({ workersAi: {}, vectorize: {} }),
      retrieveSemantic: vi.fn().mockResolvedValue(undefined),
      runBackgroundTask: () => {
        throw new Error('request lifecycle unavailable')
      },
      log
    })).toEqual({ results: keyword, mode: 'shadow' })

    expect(JSON.stringify(log.mock.calls)).not.toContain('request lifecycle unavailable')
    expect(log).toHaveBeenCalledWith({
      event: 'crm_search_shadow_failed',
      correlationId: context.correlationId,
      status: 'provider_failure'
    })
  })
})
