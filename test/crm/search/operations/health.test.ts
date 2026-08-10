import { describe, expect, it } from 'vitest'

const baseHealthInput = {
  global: { state: 'halted' as const, revision: 7 },
  counts: {
    dirty: 12,
    pending: 5,
    providerPending: 2,
    retryable: 3,
    deadLetters: 1
  },
  capacity: {
    dirty: { used: 12, limit: 100 },
    operations: { used: 10, limit: 100 }
  },
  oldestAgeSeconds: { dirty: 30, operation: 45, queue: 50 },
  schema: [{ version: 'crm-search-v1', role: 'active' as const, confirmedVectors: 8 }],
  dependency: [
    { name: 'neon' as const, status: 'ok' as const },
    { name: 'workers_ai' as const, status: 'degraded' as const },
    { name: 'vectorize' as const, status: 'ok' as const },
    { name: 'queue' as const, status: 'ok' as const }
  ],
  freshness: { staleClients: 1, sourceHighWatermarkLag: 23, p95RevisionLag: 20 },
  cost: {
    globalBudgetUsedBasisPoints: 0,
    clientsNearBudget: 0,
    configuredGlobalBudgetUsdMicros: 0
  },
  keyword: { requests: 1_000, failures: 4 },
  fallbacks: { provider_unavailable: 2 },
  security: { crossScopeCandidateRejections: 0 }
}

async function loadHealthModule() {
  return await import('~~/server/utils/crm/search/operations/health')
}

describe('CRM search operations health', () => {
  it('pins the actionable dirty/operation capacity thresholds at warn 60%, page 80%, block 90%', async () => {
    const {
      CRM_SEARCH_CAPACITY_THRESHOLDS_BASIS_POINTS,
      evaluateCrmSearchCapacityHealth
    } = await loadHealthModule()

    expect(CRM_SEARCH_CAPACITY_THRESHOLDS_BASIS_POINTS).toEqual({
      warn: 6_000,
      page: 8_000,
      blockNewIndexing: 9_000
    })

    expect(evaluateCrmSearchCapacityHealth({
      dirty: { used: 5_999, limit: 10_000 },
      operations: { used: 1, limit: 10_000 }
    })).toMatchObject({ level: 'ok', blockNewIndexing: false, notify: 'dashboard' })

    expect(evaluateCrmSearchCapacityHealth({
      dirty: { used: 6_000, limit: 10_000 },
      operations: { used: 1, limit: 10_000 }
    })).toMatchObject({ level: 'warning', blockNewIndexing: false, notify: 'warning' })

    expect(evaluateCrmSearchCapacityHealth({
      dirty: { used: 1, limit: 10_000 },
      operations: { used: 8_000, limit: 10_000 }
    })).toMatchObject({ level: 'page', blockNewIndexing: false, notify: 'page' })

    expect(evaluateCrmSearchCapacityHealth({
      dirty: { used: 9_000, limit: 10_000 },
      operations: { used: 1, limit: 10_000 }
    })).toMatchObject({ level: 'blocked', blockNewIndexing: true, notify: 'page' })
  })

  it('builds the bounded health contract with actionable dependency, freshness, cost, fallback and security evidence', async () => {
    const { buildCrmSearchHealthView } = await loadHealthModule()

    expect(buildCrmSearchHealthView(baseHealthInput)).toEqual(expect.objectContaining({
      global: { state: 'halted', revision: 7 },
      counts: expect.objectContaining({
        dirty: 12,
        pending: 5,
        providerPending: 2,
        deadLetters: 1
      }),
      oldestAgeSeconds: { dirty: 30, operation: 45, queue: 50 },
      schema: [{ version: 'crm-search-v1', role: 'active', confirmedVectors: 8 }],
      dependency: expect.arrayContaining([
        { name: 'workers_ai', status: 'degraded' }
      ]),
      freshness: { staleClients: 1, sourceHighWatermarkLag: 23, p95RevisionLag: 20 },
      cost: expect.objectContaining({
        globalBudgetUsedBasisPoints: 0,
        clientsNearBudget: 0,
        budgetState: 'disabled'
      }),
      fallbacks: { provider_unavailable: 2 },
      security: { crossScopeCandidateRejections: 0 }
    }))
  })

  it('treats keyword error rate and queue age as alert candidates while ordinary retries remain dashboard-only', async () => {
    const { buildCrmSearchHealthView } = await loadHealthModule()
    const view = buildCrmSearchHealthView({
      ...baseHealthInput,
      counts: { ...baseHealthInput.counts, retryable: 500 },
      oldestAgeSeconds: { dirty: 30, operation: 45, queue: 901 },
      keyword: { requests: 1_000, failures: 50 }
    })

    expect(view.alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ signal: 'keyword_error_rate', action: 'alert' }),
      expect.objectContaining({ signal: 'queue_age', action: 'alert' }),
      expect.objectContaining({ signal: 'retryable_operations', action: 'dashboard' })
    ]))
  })

  it('rejects malformed or high-cardinality health input instead of exposing raw details', async () => {
    const { buildCrmSearchHealthView } = await loadHealthModule()

    for (const unsafe of [
      { rawQuery: 'private customer search' },
      { providerError: 'Vectorize body with source text' },
      { requestId: 'high-cardinality-request' },
      { clientIds: ['10000000-0000-4000-8000-000000000001'] }
    ]) {
      expect(() => buildCrmSearchHealthView({ ...baseHealthInput, ...unsafe } as never))
        .toThrow('crm_search_invalid_health_input')
    }
  })
})
