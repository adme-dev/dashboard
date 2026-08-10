import { describe, expect, it, vi } from 'vitest'
import {
  CRM_SEARCH_RETRIEVAL_DEADLINE,
  createCrmRetrievalDependencies,
  revalidateCrmSemanticContext,
  retrieveCrm,
  type CrmRetrievalDependencies
} from '~~/server/utils/crm/retrieval'
import { crmSearchRepositoryDependencies } from '~~/server/utils/crm/searchIndex/repository'

const ORGANISATION_ID = '10000000-0000-4000-8000-000000000001'
const CLIENT_ID = '10000000-0000-4000-8000-000000000002'
const ACTOR_ID = '10000000-0000-4000-8000-000000000003'
const CORRELATION_ID = '10000000-0000-4000-8000-000000000004'
const AI_RESERVATION_ID = '10000000-0000-4000-8000-000000000005'
const VECTOR_RESERVATION_ID = '10000000-0000-4000-8000-000000000009'
const AI_ATTEMPT_ID = '10000000-0000-4000-8000-000000000010'
const VECTOR_ATTEMPT_ID = '10000000-0000-4000-8000-000000000011'
const COMPANY_ID = '10000000-0000-4000-8000-000000000006'
const PERSON_ID = '10000000-0000-4000-8000-000000000007'
const NAMESPACE = 'n'.repeat(43)
const VECTOR_ID = 'v'.repeat(43)

const context = {
  organisationScopeId: ORGANISATION_ID,
  clientId: CLIENT_ID,
  correlationId: CORRELATION_ID,
  actorType: 'staff' as const,
  actorId: ACTOR_ID,
  surface: 'agency_ai' as const,
  permissionSet: ['CLIENTS'],
  visibility: { ownerScoped: false },
  assistantScope: {
    clientIds: [CLIENT_ID],
    sourceRevision: 'assignment-revision-7'
  }
}

const request = {
  clientId: CLIENT_ID,
  query: 'accounts likely to renew',
  limit: 2,
  semanticEligible: true
}

const keyword = [
  { type: 'company' as const, id: COMPANY_ID, title: 'Acme', subtitle: null, rank: 0.8 },
  { type: 'person' as const, id: PERSON_ID, title: 'Alice', subtitle: null, rank: 0.7 }
]

const policy = {
  effectiveMode: 'assist' as const,
  providerEnabled: true,
  globalState: 'enabled' as const,
  controlRevision: 5,
  policyRevision: 8,
  activeSchemaVersion: 'crm-search-v1'
}

const embedding = Array(768).fill(0.25)
const queryDigestContext = {
  queryDigest: `hmac-sha256:${'a'.repeat(64)}`,
  queryDigestKeyVersion: 'analytics-v2',
  queryLengthBucket: '17_32' as const
}

function makeDeps(overrides: Partial<CrmRetrievalDependencies> = {}): CrmRetrievalDependencies {
  return {
    runKeyword: vi.fn().mockResolvedValue(keyword),
    prepareTelemetry: vi.fn().mockResolvedValue(queryDigestContext),
    loadFreshPolicy: vi.fn().mockResolvedValue(policy),
    revalidateAuthority: vi.fn().mockResolvedValue(true),
    deriveCanonicalNamespace: vi.fn().mockResolvedValue(NAMESPACE),
    reserveProviderUsage: vi.fn().mockImplementation(async ({ provider }) => ({
      status: 'reserved',
      reservationId: provider === 'workers_ai' ? AI_RESERVATION_ID : VECTOR_RESERVATION_ID,
      providerAttemptId: provider === 'workers_ai' ? AI_ATTEMPT_ID : VECTOR_ATTEMPT_ID,
      controlRevision: 5,
      policyRevision: 8
    })),
    markProviderCallSent: vi.fn().mockResolvedValue(undefined),
    settleProviderUsage: vi.fn().mockResolvedValue(undefined),
    runWithinDeadline: vi.fn(async ({ task }) => ({
      status: 'completed' as const,
      value: await task()
    })),
    embedQuery: vi.fn().mockResolvedValue({
      data: [embedding]
    }),
    queryVectorize: vi.fn().mockResolvedValue({
      count: 1,
      matches: [{ id: VECTOR_ID, score: 0.9 }]
    }),
    joinBack: vi.fn().mockResolvedValue([{
      entityType: 'company',
      entityId: COMPANY_ID,
      title: 'Acme current',
      subtitle: null,
      score: 0.9,
      semanticRank: 1
    }]),
    emitTelemetry: vi.fn().mockResolvedValue(undefined),
    continueLateSettlement: vi.fn(),
    ...overrides
  }
}

describe('authorized CRM retrieval coordinator', () => {
  it('revalidates the exact selected agency AI client through fresh assistant authority', async () => {
    const event = { context: {} } as never
    const freshContext = {
      ...context,
      correlationId: '10000000-0000-4000-8000-000000000099',
      assistantScope: {
        clientIds: [CLIENT_ID],
        sourceRevision: 'assignment-revision-7'
      }
    }
    const resolveAgencyAiContext = vi.fn().mockResolvedValue({
      status: 'resolved',
      context: freshContext,
      clientName: 'Acme'
    })
    const resolveAgencyGlobalContext = vi.fn()

    await expect(revalidateCrmSemanticContext(event, context, {
      resolveAgencyAiContext,
      resolveAgencyGlobalContext
    })).resolves.toEqual({ ...freshContext, correlationId: CORRELATION_ID })
    expect(resolveAgencyAiContext).toHaveBeenCalledWith(
      { userId: ACTOR_ID, event },
      { clientId: CLIENT_ID }
    )
    expect(resolveAgencyGlobalContext).not.toHaveBeenCalled()
  })

  it('runs authorized keyword retrieval first, then independently reserves each provider inside one deadline', async () => {
    const order: string[] = []
    const deps = makeDeps({
      runKeyword: vi.fn(async () => {
        order.push('keyword')
        return keyword
      }),
      loadFreshPolicy: vi.fn(async () => {
        order.push('policy')
        return policy
      }),
      reserveProviderUsage: vi.fn(async ({ provider }) => {
        order.push(`reserve-${provider}`)
        return {
          status: 'reserved' as const,
          reservationId: provider === 'workers_ai' ? AI_RESERVATION_ID : VECTOR_RESERVATION_ID,
          providerAttemptId: provider === 'workers_ai' ? AI_ATTEMPT_ID : VECTOR_ATTEMPT_ID,
          controlRevision: 5,
          policyRevision: 8
        }
      }),
      embedQuery: vi.fn(async () => {
        order.push('workers-ai')
        return { data: [embedding] }
      }),
      queryVectorize: vi.fn(async () => {
        order.push('vectorize')
        return { count: 1, matches: [{ id: VECTOR_ID, score: 0.9 }] }
      })
    })

    await retrieveCrm(context, request, deps)

    expect(order[0]).toBe('keyword')
    expect(deps.reserveProviderUsage).toHaveBeenNthCalledWith(1, {
      organisationScopeId: ORGANISATION_ID,
      clientId: CLIENT_ID,
      correlationId: CORRELATION_ID,
      surface: 'agency_ai',
      provider: 'workers_ai',
      providerAction: 'query',
      modelInputTokens: 512,
      queryDimensions: 0,
      providerCalls: 1
    })
    expect(deps.reserveProviderUsage).toHaveBeenNthCalledWith(2, {
      organisationScopeId: ORGANISATION_ID,
      clientId: CLIENT_ID,
      correlationId: CORRELATION_ID,
      surface: 'agency_ai',
      provider: 'vectorize',
      providerAction: 'query',
      modelInputTokens: 0,
      queryDimensions: 768,
      providerCalls: 1
    })
    expect(deps.markProviderCallSent).toHaveBeenNthCalledWith(1, {
      correlationId: CORRELATION_ID,
      providerAttemptId: AI_ATTEMPT_ID,
      expectedControlRevision: 5,
      expectedPolicyRevision: 8
    })
    expect(deps.markProviderCallSent).toHaveBeenNthCalledWith(2, {
      correlationId: CORRELATION_ID,
      providerAttemptId: VECTOR_ATTEMPT_ID,
      expectedControlRevision: 5,
      expectedPolicyRevision: 8
    })
    expect(deps.settleProviderUsage).toHaveBeenNthCalledWith(1, {
      reservationId: AI_RESERVATION_ID,
      providerCallSent: true,
      completion: 'completed'
    })
    expect(deps.settleProviderUsage).toHaveBeenNthCalledWith(2, {
      reservationId: VECTOR_RESERVATION_ID,
      providerCallSent: true,
      completion: 'completed'
    })
    const deadlineInputs = (deps.runWithinDeadline as ReturnType<typeof vi.fn>).mock.calls
      .map(call => call[0].deadlineMs as number)
    expect(deadlineInputs).toHaveLength(2)
    expect(deadlineInputs.every(value => value > 0 && value <= 500)).toBe(true)
    expect(deadlineInputs[1]).toBeLessThanOrEqual(deadlineInputs[0]!)
    expect(CRM_SEARCH_RETRIEVAL_DEADLINE).toEqual({
      revision: 'crm-search-semantic-deadline-v1',
      defaultMs: 500,
      maximumMs: 750
    })
  })

  it('bounds provider attempts without wrapping the full semantic join and fusion branch', async () => {
    const deadlineValues: unknown[] = []
    const deps = makeDeps({
      runWithinDeadline: vi.fn(async ({ task }) => {
        const value = await task()
        deadlineValues.push(value)
        return { status: 'completed' as const, value }
      }) as never
    })

    const result = await retrieveCrm(context, request, deps)

    expect(result.mode).toBe('assist')
    expect(deadlineValues).toHaveLength(2)
    expect(deadlineValues[0]).toEqual(embedding)
    expect(deadlineValues[1]).toEqual([{
      vectorId: VECTOR_ID,
      score: 0.9,
      semanticRank: 1
    }])
    expect(deadlineValues).not.toContainEqual(expect.objectContaining({ fused: expect.any(Array) }))
  })

  it('fails closed to authorized keyword before policy or provider admission when the analytics keyring is unavailable', async () => {
    const deps = makeDeps({
      prepareTelemetry: vi.fn().mockResolvedValue(null)
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'provider'
    })
    expect(deps.prepareTelemetry).toHaveBeenCalledWith({
      context,
      query: request.query
    })
    expect(deps.loadFreshPolicy).not.toHaveBeenCalled()
    expect(deps.reserveProviderUsage).not.toHaveBeenCalled()
    expect(deps.markProviderCallSent).not.toHaveBeenCalled()
    expect(deps.embedQuery).not.toHaveBeenCalled()
    expect(deps.queryVectorize).not.toHaveBeenCalled()
  })

  it('keeps captured default provider bindings idle when the dedicated analytics keyring is missing', async () => {
    const aiRun = vi.fn()
    const vectorQuery = vi.fn()
    const deps = createCrmRetrievalDependencies({
      context: {
        cloudflare: {
          env: {
            CRM_SEARCH_ANALYTICS_KEYRING: undefined,
            AI: { run: aiRun },
            CRM_SEARCH_VECTORIZE: { query: vectorQuery }
          }
        }
      }
    } as never)
    deps.runKeyword = vi.fn().mockResolvedValue(keyword)
    deps.loadFreshPolicy = vi.fn().mockResolvedValue(policy)
    deps.reserveProviderUsage = vi.fn()

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'provider'
    })

    expect(deps.loadFreshPolicy).not.toHaveBeenCalled()
    expect(deps.reserveProviderUsage).not.toHaveBeenCalled()
    expect(aiRun).not.toHaveBeenCalled()
    expect(vectorQuery).not.toHaveBeenCalled()
  })

  it('applies the same bounded deadline and late-settlement contract to shadow provider work', async () => {
    let shadowWork: Promise<unknown> | undefined
    const scheduleShadow = vi.fn((input: Parameters<NonNullable<CrmRetrievalDependencies['scheduleShadow']>>[0]) => {
      shadowWork = input.retrieveSemantic()
      return { results: [...input.keyword], mode: 'shadow' as const }
    })
    const deps = makeDeps({
      loadFreshPolicy: vi.fn().mockResolvedValue({ ...policy, effectiveMode: 'shadow' }),
      scheduleShadow
    })

    await expect(retrieveCrm(
      { ...context, surface: 'agency_global' },
      request,
      deps
    )).resolves.toEqual({ results: keyword, mode: 'shadow' })
    await shadowWork

    expect(deps.runWithinDeadline).toHaveBeenCalledWith(expect.objectContaining({
      deadlineMs: CRM_SEARCH_RETRIEVAL_DEADLINE.defaultMs
    }))
    expect(scheduleShadow).toHaveBeenCalledWith(expect.objectContaining({
      providerEnabled: true
    }))
    expect(deps.emitTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'search.shadow_completed',
      queryDigestContext,
      keywordResultCount: keyword.length,
      semanticCandidateCount: 1,
      fusedResultCount: request.limit,
      metricLabels: expect.objectContaining({
        mode: 'shadow',
        statusClass: 'shadow_completed'
      })
    }))
    expect(JSON.stringify(
      (deps.emitTelemetry as ReturnType<typeof vi.fn>).mock.calls
    )).not.toContain(request.query)
  })

  it('fresh-reads policy and session authority immediately around every provider admission and call', async () => {
    const order: string[] = []
    const loadFreshPolicy = vi.fn(async () => {
      order.push('policy')
      return policy
    })
    const deps = makeDeps({
      runKeyword: vi.fn(async () => {
        order.push('keyword')
        return keyword
      }),
      loadFreshPolicy,
      revalidateAuthority: vi.fn(async () => {
        order.push('authority')
        return true
      }),
      reserveProviderUsage: vi.fn(async ({ provider }) => {
        order.push(`reserve-${provider}`)
        return {
          status: 'reserved' as const,
          reservationId: provider === 'workers_ai' ? AI_RESERVATION_ID : VECTOR_RESERVATION_ID,
          providerAttemptId: provider === 'workers_ai' ? AI_ATTEMPT_ID : VECTOR_ATTEMPT_ID,
          controlRevision: 5,
          policyRevision: 8
        }
      }),
      markProviderCallSent: vi.fn(async ({ providerAttemptId }) => {
        order.push(providerAttemptId === AI_ATTEMPT_ID ? 'sent-workers_ai' : 'sent-vectorize')
      }),
      settleProviderUsage: vi.fn(async ({ reservationId }) => {
        order.push(reservationId === AI_RESERVATION_ID ? 'settle-workers_ai' : 'settle-vectorize')
      }),
      embedQuery: vi.fn(async () => {
        order.push('workers-ai')
        return { data: [embedding] }
      }),
      queryVectorize: vi.fn(async () => {
        order.push('vectorize')
        return { count: 1, matches: [{ id: VECTOR_ID, score: 0.9 }] }
      })
    })

    await retrieveCrm(context, request, deps)

    expect(order).toEqual([
      'keyword',
      'policy',
      'authority',
      'reserve-workers_ai',
      'policy',
      'authority',
      'sent-workers_ai',
      'workers-ai',
      'settle-workers_ai',
      'policy',
      'authority',
      'reserve-vectorize',
      'authority',
      'sent-vectorize',
      'vectorize',
      'settle-vectorize'
    ])
    expect(loadFreshPolicy).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['Workers AI admission', 1, 0, 0, 0],
    ['Workers AI call', 2, 0, 0, 1],
    ['Vectorize admission', 3, 1, 0, 1],
    ['Vectorize call', 4, 1, 0, 2]
  ])('blocks invalidated session authority immediately before %s', async (
    _label,
    rejectOnCheck,
    expectedEmbeddingCalls,
    expectedVectorCalls,
    expectedReservations
  ) => {
    let checks = 0
    const revalidateAuthority = vi.fn(async () => {
      checks += 1
      return checks !== rejectOnCheck
    })
    const deps = makeDeps({ revalidateAuthority })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'authorization'
    })
    expect(revalidateAuthority).toHaveBeenCalledTimes(rejectOnCheck)
    expect(deps.embedQuery).toHaveBeenCalledTimes(expectedEmbeddingCalls)
    expect(deps.queryVectorize).toHaveBeenCalledTimes(expectedVectorCalls)
    expect(deps.reserveProviderUsage).toHaveBeenCalledTimes(expectedReservations)
    expect(deps.markProviderCallSent).toHaveBeenCalledTimes(expectedEmbeddingCalls + expectedVectorCalls)
    if (rejectOnCheck === 2) {
      expect(deps.settleProviderUsage).toHaveBeenCalledWith({
        reservationId: AI_RESERVATION_ID,
        providerCallSent: false,
        completion: 'released_no_call'
      })
    }
    if (rejectOnCheck === 4) {
      expect(deps.settleProviderUsage).toHaveBeenCalledWith({
        reservationId: VECTOR_RESERVATION_ID,
        providerCallSent: false,
        completion: 'released_no_call'
      })
    }
  })

  it.each([
    ['before Workers AI', 2, 'embedQuery'],
    ['before Vectorize', 3, 'queryVectorize']
  ])('returns keyword and releases admission when policy halts %s', async (_label, haltOnRead, blockedCall) => {
    let reads = 0
    const loadFreshPolicy = vi.fn(async () => {
      reads += 1
      return reads >= haltOnRead
        ? { ...policy, effectiveMode: 'off' as const, providerEnabled: false, globalState: 'halted' as const, controlRevision: 6 }
        : policy
    })
    const deps = makeDeps({ loadFreshPolicy })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'disabled'
    })
    expect(deps[blockedCall as 'embedQuery' | 'queryVectorize']).not.toHaveBeenCalled()
    if (haltOnRead === 2) {
      expect(deps.settleProviderUsage).toHaveBeenCalledWith({
        reservationId: AI_RESERVATION_ID,
        providerCallSent: false,
        completion: 'released_no_call'
      })
      expect(deps.reserveProviderUsage).toHaveBeenCalledTimes(1)
    } else {
      expect(deps.settleProviderUsage).toHaveBeenCalledWith({
        reservationId: AI_RESERVATION_ID,
        providerCallSent: true,
        completion: 'completed'
      })
      expect(deps.reserveProviderUsage).toHaveBeenCalledTimes(1)
    }
  })

  it.each([
    ['policy', { loadFreshPolicy: vi.fn().mockRejectedValue(new Error('policy db')) }, 'provider'],
    ['budget', { reserveProviderUsage: vi.fn().mockResolvedValue({ status: 'denied' }) }, 'budget'],
    ['Workers AI', { embedQuery: vi.fn().mockRejectedValue(new Error('ai unavailable')) }, 'provider'],
    ['Vectorize', { queryVectorize: vi.fn().mockRejectedValue(new Error('vector unavailable')) }, 'provider'],
    ['ledger/join-back', { joinBack: vi.fn().mockRejectedValue(new Error('semantic db')) }, 'semantic_db']
  ])('falls back to the authorized keyword pool on %s branch failure', async (_label, overrides, fallbackReason) => {
    const deps = makeDeps(overrides as Partial<CrmRetrievalDependencies>)
    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason
    })
  })

  it('returns authorized keyword results when the deadline coordinator rejects', async () => {
    const deps = makeDeps({
      runWithinDeadline: vi.fn().mockRejectedValue(new Error('deadline coordinator unavailable'))
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'provider'
    })
    expect(deps.reserveProviderUsage).toHaveBeenCalledTimes(1)
    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: AI_RESERVATION_ID,
      providerCallSent: false,
      completion: 'released_no_call'
    })
    expect(deps.embedQuery).not.toHaveBeenCalled()
    expect(deps.queryVectorize).not.toHaveBeenCalled()
  })

  it('settles Workers AI before a denied Vectorize reservation and never sends the vector query', async () => {
    let reservations = 0
    const deps = makeDeps({
      reserveProviderUsage: vi.fn(async ({ provider }) => {
        reservations += 1
        return provider === 'workers_ai'
          ? {
              status: 'reserved' as const,
              reservationId: AI_RESERVATION_ID,
              providerAttemptId: AI_ATTEMPT_ID,
              controlRevision: 5,
              policyRevision: 8
            }
          : { status: 'denied' as const }
      })
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'budget'
    })
    expect(reservations).toBe(2)
    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: AI_RESERVATION_ID,
      providerCallSent: true,
      completion: 'completed'
    })
    expect(deps.queryVectorize).not.toHaveBeenCalled()
    expect(deps.markProviderCallSent).toHaveBeenCalledTimes(1)
  })

  it('propagates a primary keyword database failure and never begins semantic work', async () => {
    const failure = new Error('keyword database unavailable')
    const deps = makeDeps({ runKeyword: vi.fn().mockRejectedValue(failure) })
    await expect(retrieveCrm(context, request, deps)).rejects.toBe(failure)
    expect(deps.loadFreshPolicy).not.toHaveBeenCalled()
    expect(deps.reserveProviderUsage).not.toHaveBeenCalled()
    expect(deps.embedQuery).not.toHaveBeenCalled()
    expect(deps.queryVectorize).not.toHaveBeenCalled()
  })

  it('ignores late provider output, returns keyword, and retains no raw query in background settlement', async () => {
    let releaseEmbedding!: () => void
    const embeddingPending = new Promise<void>((resolve) => {
      releaseEmbedding = resolve
    })
    let settlementOnlyWork: Promise<void> | undefined
    const continueLateSettlement = vi.fn((provenance, work: Promise<void>) => {
      settlementOnlyWork = work
      expect(Object.keys(provenance).sort()).toEqual([
        'accountingDisposition',
        'correlationId',
        'deadlineMs',
        'elapsedMs',
        'provider',
        'providerAttemptId',
        'providerCallSentAtTimeout',
        'queryDigestContext',
        'reservationId'
      ])
    })
    const deps = makeDeps({
      embedQuery: vi.fn(async () => {
        await embeddingPending
        return { data: [embedding] }
      }),
      runWithinDeadline: vi.fn(async ({ task, onLateCompletion }) => {
        const work = task()
        for (let turn = 0; turn < 20 && !(deps.embedQuery as ReturnType<typeof vi.fn>).mock.calls.length; turn += 1) {
          await Promise.resolve()
        }
        onLateCompletion(work)
        return { status: 'timed_out' as const }
      }),
      continueLateSettlement
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'timeout'
    })
    expect(deps.continueLateSettlement).toHaveBeenCalledTimes(1)
    const retained = continueLateSettlement.mock.calls[0]?.[0]
    expect(retained).toMatchObject({
      reservationId: AI_RESERVATION_ID,
      providerAttemptId: AI_ATTEMPT_ID,
      correlationId: CORRELATION_ID,
      provider: 'workers_ai',
      providerCallSentAtTimeout: true,
      accountingDisposition: 'late_discarded',
      queryDigestContext
    })
    expect(JSON.stringify(retained)).not.toContain(request.query)
    expect(JSON.stringify(retained)).not.toContain('Acme')
    releaseEmbedding()
    await expect(settlementOnlyWork).resolves.toBeUndefined()
    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: AI_RESERVATION_ID,
      providerCallSent: true,
      completion: 'late_discarded'
    })
    expect(deps.queryVectorize).not.toHaveBeenCalled()
    expect(deps.joinBack).not.toHaveBeenCalled()
  })

  it('releases an admission when the deadline expires before the provider attempt is sent', async () => {
    const deps = makeDeps({
      runWithinDeadline: vi.fn(async ({ task, onLateCompletion }) => {
        const work = Promise.resolve().then(task)
        onLateCompletion(work)
        return { status: 'timed_out' as const }
      })
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'timeout'
    })
    const settlementOnlyWork = (deps.continueLateSettlement as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
    await settlementOnlyWork

    expect(deps.markProviderCallSent).not.toHaveBeenCalled()
    expect(deps.embedQuery).not.toHaveBeenCalled()
    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: AI_RESERVATION_ID,
      providerCallSent: false,
      completion: 'released_no_call'
    })
  })

  it('does not call a provider when the deadline expires while the sent CAS is in flight', async () => {
    let releaseSentCas!: () => void
    const sentCasPending = new Promise<void>((resolve) => {
      releaseSentCas = resolve
    })
    const deps = makeDeps({
      markProviderCallSent: vi.fn(async () => {
        await sentCasPending
      }),
      runWithinDeadline: vi.fn(async ({ task, onLateCompletion }) => {
        const work = task()
        for (let turn = 0; turn < 40
          && !(deps.markProviderCallSent as ReturnType<typeof vi.fn>).mock.calls.length;
          turn += 1) await Promise.resolve()
        onLateCompletion(work)
        return { status: 'timed_out' as const }
      })
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'timeout'
    })
    releaseSentCas()
    const settlementOnlyWork = (deps.continueLateSettlement as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
    await settlementOnlyWork

    expect(deps.embedQuery).not.toHaveBeenCalled()
    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: AI_RESERVATION_ID,
      providerCallSent: true,
      completion: 'late_discarded'
    })
  })

  it('marks the branch abandoned before late work can resume from the timeout callback', async () => {
    let releaseEmbedding!: () => void
    const embeddingPending = new Promise<void>((resolve) => {
      releaseEmbedding = resolve
    })
    const deps = makeDeps({
      embedQuery: vi.fn(async () => {
        await embeddingPending
        return { data: [embedding] }
      }),
      runWithinDeadline: vi.fn(async ({ task, onLateCompletion }) => {
        const work = task()
        for (let turn = 0; turn < 40
          && !(deps.embedQuery as ReturnType<typeof vi.fn>).mock.calls.length;
          turn += 1) await Promise.resolve()
        onLateCompletion(work)
        releaseEmbedding()
        await work
        return { status: 'timed_out' as const }
      })
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'timeout'
    })

    expect(deps.queryVectorize).not.toHaveBeenCalled()
    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: AI_RESERVATION_ID,
      providerCallSent: true,
      completion: 'late_discarded'
    })
  })

  it('discards a late Vectorize result before join-back and conservatively settles the sent call', async () => {
    let releaseVector!: () => void
    const vectorPending = new Promise<void>((resolve) => {
      releaseVector = resolve
    })
    let deadlineRuns = 0
    let settlementOnlyWork: Promise<void> | undefined
    const deps = makeDeps({
      queryVectorize: vi.fn(async () => {
        await vectorPending
        return { count: 1, matches: [{ id: VECTOR_ID, score: 0.9 }] }
      }),
      runWithinDeadline: vi.fn(async ({ task, onLateCompletion }) => {
        deadlineRuns += 1
        const work = task()
        if (deadlineRuns === 1) {
          return { status: 'completed' as const, value: await work }
        }
        for (let turn = 0; turn < 40
          && !(deps.queryVectorize as ReturnType<typeof vi.fn>).mock.calls.length;
          turn += 1) await Promise.resolve()
        onLateCompletion(work)
        return { status: 'timed_out' as const }
      }),
      continueLateSettlement: vi.fn((_provenance, work) => {
        settlementOnlyWork = work
      })
    })

    await expect(retrieveCrm(context, request, deps)).resolves.toEqual({
      results: keyword,
      mode: 'keyword',
      fallbackReason: 'timeout'
    })
    releaseVector()
    await settlementOnlyWork

    expect(deps.settleProviderUsage).toHaveBeenCalledWith({
      reservationId: VECTOR_RESERVATION_ID,
      providerCallSent: true,
      completion: 'late_discarded'
    })
    expect(deps.joinBack).not.toHaveBeenCalled()
    expect(deps.emitTelemetry).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'search.fallback',
      fallbackClass: 'deadline',
      metricLabels: expect.objectContaining({ provider: 'vectorize' })
    }))
  })

  it('never sends identifier-like or portal queries to either provider and returns the keyword ceiling', async () => {
    for (const [inputContext, inputRequest] of [
      [context, { ...request, query: 'alice@example.com', semanticEligible: false }],
      [{ ...context, surface: 'portal_global' as const, actorType: 'portal' as const }, request]
    ] as const) {
      const deps = makeDeps()
      await expect(retrieveCrm(inputContext, inputRequest, deps)).resolves.toEqual({
        results: keyword,
        mode: 'keyword',
        fallbackReason: inputContext.surface === 'portal_global' ? 'disabled' : 'privacy'
      })
      expect(deps.reserveProviderUsage).not.toHaveBeenCalled()
      expect(deps.embedQuery).not.toHaveBeenCalled()
      expect(deps.queryVectorize).not.toHaveBeenCalled()
      expect(JSON.stringify((deps.emitTelemetry as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(inputRequest.query)
    }
  })

  it('fuses complete deduplicated pools before limiting with stable RRF tie-breaks', async () => {
    const keywordPool = [
      { type: 'person' as const, id: PERSON_ID, title: 'Keyword first', subtitle: null, rank: 1 },
      { type: 'company' as const, id: COMPANY_ID, title: 'Shared first', subtitle: null, rank: 0.9 },
      { type: 'company' as const, id: COMPANY_ID, title: 'Shared duplicate', subtitle: null, rank: 0.8 }
    ]
    const semanticPool = [
      { entityType: 'opportunity' as const, entityId: '10000000-0000-4000-8000-000000000008', title: 'Semantic first', subtitle: null, score: 0.92, semanticRank: 1 },
      { entityType: 'company' as const, entityId: COMPANY_ID, title: 'Shared current', subtitle: null, score: 0.90, semanticRank: 2 }
    ]
    const deps = makeDeps({
      runKeyword: vi.fn().mockResolvedValue(keywordPool),
      joinBack: vi.fn().mockResolvedValue(semanticPool)
    })

    const result = await retrieveCrm(context, { ...request, limit: 1 }, deps)

    expect(result).toEqual({
      results: [{ type: 'company', id: COMPANY_ID, title: 'Shared current', subtitle: null, rank: expect.any(Number) }],
      mode: 'assist'
    })
  })

  it('never puts raw queries, titles, provider errors, actors, clients, or correlations in metric labels/log fields', async () => {
    const providerError = new Error('vector leaked-body Alice acme@example.com')
    const emitTelemetry = vi.fn().mockResolvedValue(undefined)
    const deps = makeDeps({
      queryVectorize: vi.fn().mockRejectedValue(providerError),
      emitTelemetry
    })

    await retrieveCrm(context, request, deps)

    const telemetry = emitTelemetry.mock.calls.flatMap(call => call)
    const serialized = JSON.stringify(telemetry)
    expect(serialized).not.toContain(request.query)
    expect(serialized).not.toContain('Acme')
    expect(serialized).not.toContain(providerError.message)
    expect(serialized).not.toContain(ACTOR_ID)
    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventType: 'search.fallback',
        fallbackClass: 'provider_unavailable',
        metricLabels: {
          mode: 'assist',
          surface: 'agency_ai',
          provider: 'vectorize',
          statusClass: 'fallback',
          fallbackClass: 'provider_unavailable'
        },
        correlationId: CORRELATION_ID
      })
    ]))
    expect(telemetry[0]?.metricLabels).not.toHaveProperty('clientId')
    expect(telemetry[0]?.metricLabels).not.toHaveProperty('correlationId')
  })

  it('uses only the active dedicated analytics key in the default HMAC persistence adapter', async () => {
    const analyticsKeyring = JSON.stringify({
      activeKeyVersion: 'analytics-v2',
      keys: {
        'analytics-v1': 'p'.repeat(32),
        'analytics-v2': 'a'.repeat(32)
      }
    })
    const event = {
      context: {
        cloudflare: {
          env: {
            CRM_SEARCH_ANALYTICS_KEYRING: analyticsKeyring,
            AI: { run: vi.fn() },
            CRM_SEARCH_VECTORIZE: { query: vi.fn() }
          }
        }
      }
    } as never
    const deps = createCrmRetrievalDependencies(event)
    const prepared = await deps.prepareTelemetry({ context, query: request.query })
    expect(prepared).toEqual({
      queryDigest: expect.stringMatching(/^hmac-sha256:[a-f0-9]{64}$/),
      queryDigestKeyVersion: 'analytics-v2',
      queryLengthBucket: '17_32'
    })

    const query = vi.fn().mockResolvedValue({
      rows: [{ id: '10000000-0000-4000-8000-000000000012' }]
    })
    const originalTransaction = crmSearchRepositoryDependencies.transactionWithoutRetry
    crmSearchRepositoryDependencies.transactionWithoutRetry = vi.fn(
      async callback => await callback({ query })
    ) as never
    try {
      await deps.emitTelemetry({
        eventType: 'search.security_rejection',
        organisationScopeId: ORGANISATION_ID,
        clientId: CLIENT_ID,
        correlationId: CORRELATION_ID,
        actorType: 'staff',
        queryDigestContext: prepared!,
        keywordResultCount: keyword.length,
        semanticCandidateCount: 1,
        fusedResultCount: 0,
        rankEvidence: { reasonClass: 'foreign_candidate' },
        fallbackClass: 'authorization_changed',
        metricLabels: {
          mode: 'assist',
          surface: 'agency_ai',
          provider: 'postgres',
          statusClass: 'security_rejection',
          fallbackClass: 'authorization_changed'
        }
      })
    } finally {
      crmSearchRepositoryDependencies.transactionWithoutRetry = originalTransaction
    }

    const params = query.mock.calls[0]?.[1]
    expect(params).toContain(prepared?.queryDigest)
    expect(params).toContain('analytics-v2')
    const serialized = JSON.stringify(query.mock.calls)
    expect(serialized).not.toContain(request.query)
    expect(serialized).not.toContain('a'.repeat(32))
    expect(serialized).not.toContain('p'.repeat(32))
  })
})
