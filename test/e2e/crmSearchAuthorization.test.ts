import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { CrmRetrievalDependencies } from '~~/server/utils/crm/retrieval'
import type { CrmSearchContext } from '~~/server/utils/crm/searchContext'

const routeBoundary = vi.hoisted(() => ({
  requireClientCrmAccess: vi.fn(),
  resolveAgencyCrmSearchContext: vi.fn(),
  resolvePortalCrmSearchContext: vi.fn(),
  runCrmKeywordSearch: vi.fn(),
  createCrmRetrievalDependencies: vi.fn()
}))

vi.mock('~~/server/utils/crm/clientCrmAccess', () => ({
  requireClientCrmAccess: (...args: unknown[]) => routeBoundary.requireClientCrmAccess(...args)
}))

vi.mock('~~/server/utils/crm/searchContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/crm/searchContext')>()
  return {
    ...actual,
    resolveAgencyCrmSearchContext: (...args: unknown[]) =>
      routeBoundary.resolveAgencyCrmSearchContext(...args),
    resolvePortalCrmSearchContext: (...args: unknown[]) =>
      routeBoundary.resolvePortalCrmSearchContext(...args)
  }
})

vi.mock('~~/server/utils/crm/search', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/crm/search')>()
  return {
    ...actual,
    runCrmKeywordSearch: (...args: unknown[]) => routeBoundary.runCrmKeywordSearch(...args)
  }
})

let routeDependencies: CrmRetrievalDependencies

vi.mock('~~/server/utils/crm/retrieval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/crm/retrieval')>()
  return {
    ...actual,
    createCrmRetrievalDependencies: (event: unknown) => {
      routeBoundary.createCrmRetrievalDependencies(event)
      return routeDependencies
    }
  }
})

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <Handler>(handler: Handler) => Handler
  readBody: (event: { body?: unknown }) => Promise<unknown>
}
globals.defineEventHandler = handler => handler
globals.readBody = async event => event.body

const ORGANISATION_ID = '10000000-0000-4000-8000-000000000001'
const CLIENT_ID = '10000000-0000-4000-8000-000000000002'
const FOREIGN_CLIENT_ID = '10000000-0000-4000-8000-000000000003'
const ACTOR_ID = '10000000-0000-4000-8000-000000000004'
const CORRELATION_ID = '10000000-0000-4000-8000-000000000005'
const PERSON_ID = '10000000-0000-4000-8000-000000000006'
const COMPANY_ID = '10000000-0000-4000-8000-000000000007'
const VECTOR_ID = 'v'.repeat(43)
const NAMESPACE = 'n'.repeat(43)
const RAW_QUERY = 'accounts likely to renew'

const keyword = [
  { type: 'person' as const, id: PERSON_ID, title: 'Owner-visible Alice', subtitle: null, rank: 1 },
  { type: 'company' as const, id: COMPANY_ID, title: 'Owner-visible Acme', subtitle: null, rank: 0.8 }
]

const agencyContext: CrmSearchContext = {
  organisationScopeId: ORGANISATION_ID,
  clientId: CLIENT_ID,
  correlationId: CORRELATION_ID,
  actorType: 'staff',
  actorId: ACTOR_ID,
  surface: 'agency_global',
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: true }
}

const portalContext: CrmSearchContext = {
  ...agencyContext,
  actorType: 'portal',
  surface: 'portal_global',
  permissionSet: ['crm.core', 'crm.view'],
  visibility: { ownerScoped: false }
}

const agencyAiContext: CrmSearchContext = {
  ...agencyContext,
  surface: 'agency_ai',
  visibility: { ownerScoped: false },
  assistantScope: {
    clientIds: [CLIENT_ID],
    sourceRevision: 'assignment-revision-11'
  }
}

type Harness = {
  dependencies: CrmRetrievalDependencies
  shadowWork: Promise<unknown>[]
  providerCalls: {
    workersAi: ReturnType<typeof vi.fn>
    vectorize: ReturnType<typeof vi.fn>
  }
}

function createHarness(mode: 'off' | 'shadow' | 'assist'): Harness {
  const shadowWork: Promise<unknown>[] = []
  const workersAi = vi.fn().mockResolvedValue({ data: [Array(768).fill(0.125)] })
  const vectorize = vi.fn().mockResolvedValue({
    count: 1,
    matches: [{ id: VECTOR_ID, score: 0.92 }]
  })
  const providerEnabled = mode !== 'off'
  const policy = {
    effectiveMode: mode,
    providerEnabled,
    globalState: providerEnabled ? 'enabled' as const : 'halted' as const,
    controlRevision: 17,
    policyRevision: 29,
    activeSchemaVersion: 'crm-search-v1'
  }
  const dependencies: CrmRetrievalDependencies = {
    runKeyword: vi.fn().mockResolvedValue(keyword),
    prepareTelemetry: vi.fn().mockResolvedValue({
      queryDigest: `hmac-sha256:${'a'.repeat(64)}`,
      queryDigestKeyVersion: 'analytics-e2e-v1',
      queryLengthBucket: '17_32'
    }),
    loadFreshPolicy: vi.fn().mockResolvedValue(policy),
    deriveCanonicalNamespace: vi.fn().mockResolvedValue(NAMESPACE),
    reserveProviderUsage: vi.fn().mockImplementation(async ({ provider }) => ({
      status: 'reserved',
      reservationId: provider === 'workers_ai'
        ? '20000000-0000-4000-8000-000000000001'
        : '20000000-0000-4000-8000-000000000002',
      providerAttemptId: provider === 'workers_ai'
        ? '30000000-0000-4000-8000-000000000001'
        : '30000000-0000-4000-8000-000000000002',
      controlRevision: 17,
      policyRevision: 29
    })),
    markProviderCallSent: vi.fn().mockResolvedValue(undefined),
    settleProviderUsage: vi.fn().mockResolvedValue(undefined),
    runWithinDeadline: vi.fn(async ({ task }) => ({
      status: 'completed' as const,
      value: await task()
    })),
    embedQuery: workersAi,
    queryVectorize: vectorize,
    joinBack: vi.fn().mockResolvedValue([{
      entityType: 'company',
      entityId: COMPANY_ID,
      title: 'Owner-visible Acme (current Postgres)',
      subtitle: null,
      score: 0.92,
      semanticRank: 1
    }]),
    emitTelemetry: vi.fn().mockResolvedValue(undefined),
    continueLateSettlement: vi.fn(),
    scheduleShadow: vi.fn((input) => {
      shadowWork.push(input.retrieveSemantic())
      return {
        results: [...input.keyword].slice(0, input.request.limit),
        mode: 'shadow' as const
      }
    })
  }
  return { dependencies, shadowWork, providerCalls: { workersAi, vectorize } }
}

function clientNotFound(): Error & { statusCode: number, statusMessage: string } {
  return Object.assign(new Error('Client not found'), {
    statusCode: 404,
    statusMessage: 'Client not found'
  })
}

async function publicError(work: Promise<unknown>) {
  try {
    await work
    return null
  } catch (error) {
    const value = error as { statusCode?: unknown, statusMessage?: unknown }
    return { statusCode: value.statusCode, statusMessage: value.statusMessage }
  }
}

describe('CRM search endpoint authorization E2E harness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeBoundary.requireClientCrmAccess.mockResolvedValue({ clientId: CLIENT_ID })
    routeBoundary.resolveAgencyCrmSearchContext.mockResolvedValue(agencyContext)
    routeBoundary.resolvePortalCrmSearchContext.mockResolvedValue(portalContext)
    routeBoundary.runCrmKeywordSearch.mockResolvedValue(keyword)
    routeDependencies = createHarness('off').dependencies
  })

  it('runs the real staff route with the fresh owner-scoped context and default-off provider ceiling', async () => {
    const handler = (await import('~~/server/api/crm/search.post')).default
    const harness = createHarness('off')
    routeDependencies = harness.dependencies
    const event = { context: {}, body: { clientId: CLIENT_ID, query: RAW_QUERY, limit: 20 } }

    await expect(handler(event as never)).resolves.toEqual({ results: keyword })
    expect(routeBoundary.resolveAgencyCrmSearchContext).toHaveBeenCalledWith(event, {
      clientId: CLIENT_ID,
      surface: 'agency_global'
    })
    expect(harness.dependencies.runKeyword).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR_ID,
        clientId: CLIENT_ID,
        visibility: { ownerScoped: true }
      }),
      RAW_QUERY,
      50
    )
    expect(harness.providerCalls.workersAi).not.toHaveBeenCalled()
    expect(harness.providerCalls.vectorize).not.toHaveBeenCalled()
  })

  it('makes inaccessible and nonexistent clients indistinguishable before keyword or provider work', async () => {
    const handler = (await import('~~/server/api/crm/search.post')).default
    const harness = createHarness('assist')
    routeDependencies = harness.dependencies
    routeBoundary.resolveAgencyCrmSearchContext
      .mockRejectedValueOnce(clientNotFound())
      .mockRejectedValueOnce(clientNotFound())

    const inaccessible = await publicError(handler({
      context: {},
      body: { clientId: FOREIGN_CLIENT_ID, query: RAW_QUERY }
    } as never))
    const nonexistent = await publicError(handler({
      context: {},
      body: { clientId: '90000000-0000-4000-8000-000000000009', query: RAW_QUERY }
    } as never))

    expect(inaccessible).toEqual({ statusCode: 404, statusMessage: 'Client not found' })
    expect(nonexistent).toEqual(inaccessible)
    expect(harness.dependencies.runKeyword).not.toHaveBeenCalled()
    expect(harness.dependencies.loadFreshPolicy).not.toHaveBeenCalled()
    expect(harness.dependencies.reserveProviderUsage).not.toHaveBeenCalled()
    expect(harness.providerCalls.workersAi).not.toHaveBeenCalled()
    expect(harness.providerCalls.vectorize).not.toHaveBeenCalled()
  })

  it('runs the real portal route as a view using only its active session client and zero providers', async () => {
    const handler = (await import('~~/server/api/client-portal/crm/search.post')).default
    const harness = createHarness('assist')
    routeDependencies = harness.dependencies
    const event = {
      context: {
        cloudflare: {
          env: {
            AI: { run: harness.providerCalls.workersAi },
            CRM_SEARCH_VECTORIZE: { query: harness.providerCalls.vectorize }
          }
        }
      },
      body: { query: RAW_QUERY, limit: 1 }
    }

    await expect(handler(event as never)).resolves.toEqual({ results: keyword.slice(0, 1) })
    expect(routeBoundary.requireClientCrmAccess).toHaveBeenCalledWith(event, 'view')
    expect(routeBoundary.resolvePortalCrmSearchContext).toHaveBeenCalledWith(event, {
      surface: 'portal_global'
    })
    expect(routeBoundary.runCrmKeywordSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'portal',
        clientId: CLIENT_ID,
        surface: 'portal_global'
      }),
      RAW_QUERY,
      50
    )
    expect(routeBoundary.createCrmRetrievalDependencies).not.toHaveBeenCalled()
    expect(harness.providerCalls.workersAi).not.toHaveBeenCalled()
    expect(harness.providerCalls.vectorize).not.toHaveBeenCalled()

    await expect(handler({
      context: {},
      body: { clientId: FOREIGN_CLIENT_ID, query: RAW_QUERY }
    } as never)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('lets agency-global shadow call providers but preserves the exact visible keyword order', async () => {
    const handler = (await import('~~/server/api/crm/search.post')).default
    const harness = createHarness('shadow')
    routeDependencies = harness.dependencies

    await expect(handler({
      context: {},
      body: { clientId: CLIENT_ID, query: RAW_QUERY, limit: 20 }
    } as never)).resolves.toEqual({ results: keyword })
    await expect(Promise.all(harness.shadowWork)).resolves.toHaveLength(1)

    expect(harness.providerCalls.workersAi).toHaveBeenCalledTimes(1)
    expect(harness.providerCalls.vectorize).toHaveBeenCalledTimes(1)
    expect(harness.dependencies.joinBack).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ surface: 'agency_global', clientId: CLIENT_ID }),
      activeSchemaVersion: 'crm-search-v1',
      canonicalNamespace: NAMESPACE
    }))
  })

  it('returns fused ordering only through the direct agency-AI tool path', async () => {
    const { retrieveCrm } = await import('~~/server/utils/crm/retrieval')
    const { searchCrm } = await import('~~/server/utils/ai/tools/searchCrm')
    const harness = createHarness('assist')
    const toolContext: ToolContext = {
      userId: ACTOR_ID,
      userRole: 'owner',
      event: { context: {} } as never
    }

    const result = await searchCrm({
      clientName: 'Acme',
      query: RAW_QUERY,
      limit: 20
    }, toolContext, {
      resolveContext: vi.fn().mockResolvedValue({
        status: 'resolved',
        context: agencyAiContext,
        clientName: 'Acme'
      }),
      createRetrievalDependencies: vi.fn().mockReturnValue(harness.dependencies),
      retrieveCrm
    })

    expect(result).toEqual({
      ok: true,
      data: {
        client: 'Acme',
        results: [
          {
            type: 'company',
            id: COMPANY_ID,
            title: 'Owner-visible Acme (current Postgres)',
            subtitle: null
          },
          {
            type: 'person',
            id: PERSON_ID,
            title: 'Owner-visible Alice',
            subtitle: null
          }
        ],
        more: 0
      }
    })
    expect(harness.providerCalls.workersAi).toHaveBeenCalledTimes(1)
    expect(harness.providerCalls.vectorize).toHaveBeenCalledTimes(1)
  })

  it('abstains below the semantic threshold and keeps the authorized keyword pool', async () => {
    const { retrieveCrm } = await import('~~/server/utils/crm/retrieval')
    const { searchCrm } = await import('~~/server/utils/ai/tools/searchCrm')
    const harness = createHarness('assist')
    harness.dependencies.queryVectorize = vi.fn().mockResolvedValue({
      count: 1,
      matches: [{ id: VECTOR_ID, score: 0.749999 }]
    })
    harness.dependencies.joinBack = vi.fn(async ({ candidates }) => {
      expect(candidates).toEqual([])
      return []
    })
    const toolContext: ToolContext = {
      userId: ACTOR_ID,
      userRole: 'owner',
      event: { context: {} } as never
    }

    const result = await searchCrm({
      clientName: 'Acme',
      query: RAW_QUERY,
      limit: 20
    }, toolContext, {
      resolveContext: vi.fn().mockResolvedValue({
        status: 'resolved',
        context: agencyAiContext,
        clientName: 'Acme'
      }),
      createRetrievalDependencies: vi.fn().mockReturnValue(harness.dependencies),
      retrieveCrm
    })

    expect(result).toEqual({
      ok: true,
      data: {
        client: 'Acme',
        results: keyword.map(({ rank: _rank, ...hit }) => hit),
        more: 0
      }
    })
    expect(harness.dependencies.joinBack).toHaveBeenCalledTimes(1)
  })

  it('re-reads a control flip before Vectorize and releases the semantic branch to keyword', async () => {
    const { retrieveCrm } = await import('~~/server/utils/crm/retrieval')
    const harness = createHarness('assist')
    let policyReads = 0
    harness.dependencies.loadFreshPolicy = vi.fn(async () => {
      policyReads += 1
      return policyReads >= 3
        ? {
            effectiveMode: 'off' as const,
            providerEnabled: false,
            globalState: 'halted' as const,
            controlRevision: 20,
            policyRevision: 29,
            activeSchemaVersion: 'crm-search-v1'
          }
        : {
            effectiveMode: 'assist' as const,
            providerEnabled: true,
            globalState: 'enabled' as const,
            controlRevision: 17,
            policyRevision: 29,
            activeSchemaVersion: 'crm-search-v1'
          }
    })

    await expect(retrieveCrm(agencyAiContext, {
      query: RAW_QUERY,
      limit: 20,
      semanticEligible: true
    }, harness.dependencies)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'disabled'
    })
    expect(policyReads).toBe(3)
    expect(harness.providerCalls.workersAi).toHaveBeenCalledTimes(1)
    expect(harness.providerCalls.vectorize).not.toHaveBeenCalled()
    expect(harness.dependencies.reserveProviderUsage).toHaveBeenCalledTimes(1)
  })

  it('abandons a timed-out provider result, settles it late, and retains no raw query', async () => {
    const { retrieveCrm } = await import('~~/server/utils/crm/retrieval')
    const harness = createHarness('assist')
    let releaseEmbedding!: () => void
    const embeddingPending = new Promise<void>((resolve) => {
      releaseEmbedding = resolve
    })
    let settlementOnlyWork: Promise<void> | undefined
    harness.dependencies.embedQuery = vi.fn(async () => {
      await embeddingPending
      return { data: [Array(768).fill(0.125)] }
    })
    harness.dependencies.runWithinDeadline = vi.fn(async ({ task, onLateCompletion }) => {
      const work = task()
      for (let turn = 0; turn < 30
        && !(harness.dependencies.embedQuery as ReturnType<typeof vi.fn>).mock.calls.length;
        turn += 1) await Promise.resolve()
      onLateCompletion(work)
      return { status: 'timed_out' as const }
    }) as never
    harness.dependencies.continueLateSettlement = vi.fn((provenance, work) => {
      settlementOnlyWork = work
      expect(JSON.stringify(provenance)).not.toContain(RAW_QUERY)
      expect(JSON.stringify(provenance)).not.toContain('Owner-visible')
    })

    await expect(retrieveCrm(agencyAiContext, {
      query: RAW_QUERY,
      limit: 20,
      semanticEligible: true
    }, harness.dependencies)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'timeout'
    })
    releaseEmbedding()
    await expect(settlementOnlyWork).resolves.toBeUndefined()
    expect(harness.dependencies.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: '20000000-0000-4000-8000-000000000001',
      providerCallSent: true,
      completion: 'late_discarded'
    })
    expect(harness.providerCalls.vectorize).not.toHaveBeenCalled()
  })

  it('keeps identifier searches keyword-only and never emits raw query text in evidence', async () => {
    const handler = (await import('~~/server/api/crm/search.post')).default
    const harness = createHarness('assist')
    routeDependencies = harness.dependencies
    const identifier = 'alice@example.com'

    await expect(handler({
      context: {},
      body: { clientId: CLIENT_ID, query: identifier, limit: 20 }
    } as never)).resolves.toEqual({ results: keyword })

    expect(harness.providerCalls.workersAi).not.toHaveBeenCalled()
    expect(harness.providerCalls.vectorize).not.toHaveBeenCalled()
    expect(JSON.stringify(
      (harness.dependencies.emitTelemetry as ReturnType<typeof vi.fn>).mock.calls
    )).not.toContain(identifier)
  })
})
