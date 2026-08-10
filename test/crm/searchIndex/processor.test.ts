import { describe, expect, it, vi } from 'vitest'

import {
  processCrmSearchOperation,
  reserveCrmSearchProcessRequest
} from '~~/server/utils/crm/searchIndex/processor'

const operationId = '11111111-1111-4111-8111-111111111111'
const organisationScopeId = '22222222-2222-4222-8222-222222222222'
const clientId = '33333333-3333-4333-8333-333333333333'
const entityId = '44444444-4444-4444-8444-444444444444'
const correlationId = '55555555-5555-4555-8555-555555555555'
const namespace = 'oNmEHqD21LtKoRd1vUFkSadsyBM8y9jelSpv6UfJjy4'
const vectorId = 'ohuXvpFaoi6E5QOIoE3zaeRuh-jOjPq5-JYyn0S6ajE'
const confirmationTag = `hmac-sha256:${'a'.repeat(64)}`

function operation(overrides: Record<string, unknown> = {}) {
  return {
    id: operationId,
    organisationScopeId,
    clientId,
    entityType: 'company',
    entityId,
    schemaVersion: 'crm-search-v1',
    sourceRevision: 7,
    sourceEventSequence: 12,
    desiredAction: 'upsert',
    vectorId,
    namespace,
    contentHash: 'b'.repeat(64),
    confirmationTag,
    confirmationKeyVersion: 'k1',
    controlRevision: 9,
    state: 'processing',
    leaseToken: '66666666-6666-4666-8666-666666666666',
    leaseGeneration: 3,
    ...overrides
  }
}

function runtime(events: string[]) {
  return {
    ai: {
      run: vi.fn(async () => {
        events.push('workers_ai')
        return { data: [Array(768).fill(0.125)] }
      })
    },
    vectorize: {
      upsert: vi.fn(async () => {
        events.push('vectorize_upsert')
        return { mutationId: 'mutation-upsert-1' }
      }),
      deleteByIds: vi.fn(async () => {
        events.push('vectorize_delete')
        return { mutationId: 'mutation-delete-1' }
      }),
      getByIds: vi.fn()
    }
  }
}

function dependencies(events: string[], overrides: Record<string, unknown> = {}) {
  return {
    correlationId,
    claimOperation: vi.fn(async () => {
      events.push('claim')
      return operation()
    }),
    loadCurrentContext: vi.fn(async () => {
      events.push('fresh_context')
      return {
        source: {
          exists: true,
          deleted: false,
          revision: 7,
          eventSequence: 12,
          document: {
            canonicalText: 'Name: Atlas Motors',
            providerInput: 'Name: Atlas Motors',
            contentHash: 'b'.repeat(64)
          }
        },
        schemaRole: 'active',
        canonicalNamespace: namespace,
        teardownId: null,
        documentAlreadyCurrent: false
      }
    }),
    admitProviderCall: vi.fn(async (input: { provider: string }) => {
      events.push(`admit_${input.provider}`)
      return {
        providerAttemptId: `${input.provider}-attempt-1`,
        reservationId: input.provider === 'workers_ai'
          ? '77777777-7777-4777-8777-777777777777'
          : '88888888-8888-4888-8888-888888888888',
        controlRevision: 9
      }
    }),
    markProviderCallSent: vi.fn(async (input: { provider: string }) => {
      events.push(`sent_${input.provider}`)
    }),
    settleProviderCall: vi.fn(async (input: { provider: string }) => {
      events.push(`settle_${input.provider}`)
    }),
    admitOperation: vi.fn(async () => {
      events.push('admit_operation')
    }),
    recordProviderAcceptance: vi.fn(async () => {
      events.push('provider_pending')
    }),
    markCompleteNoop: vi.fn(),
    markSuperseded: vi.fn(),
    returnToRetryable: vi.fn(async () => {
      events.push('retryable')
    }),
    markAmbiguousProviderOutcome: vi.fn(async () => {
      events.push('ambiguous')
    }),
    loadProviderAttempt: vi.fn().mockResolvedValue(null),
    markIndexed: vi.fn(),
    ...overrides
  }
}

describe('CRM search operation processor', () => {
  it('derives endpoint replay/idempotency only from fresh durable operation state', async () => {
    const queryOneFresh = vi.fn()
      .mockResolvedValueOnce({ state: 'provider_pending', lease_expires_at: null })
      .mockResolvedValueOnce({ state: 'retryable', lease_expires_at: null })
    const input = { operationId, correlationId, protocolVersion: 1 as const }

    await expect(reserveCrmSearchProcessRequest(input, { queryOneFresh } as never))
      .resolves.toEqual({
        status: 'replay', outcome: { status: 'accepted_provider_pending' }
      })
    await expect(reserveCrmSearchProcessRequest(input, { queryOneFresh } as never))
      .resolves.toEqual({ status: 'reserved' })
    expect(queryOneFresh).toHaveBeenCalledTimes(2)
  })

  it('claims, fresh-loads, reserves each call before send, and stops at provider_pending', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events)

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })

    expect(events).toEqual([
      'claim',
      'fresh_context',
      'admit_workers_ai',
      'sent_workers_ai',
      'workers_ai',
      'settle_workers_ai',
      'admit_vectorize',
      'admit_operation',
      'sent_vectorize',
      'vectorize_upsert',
      'provider_pending',
      'settle_vectorize'
    ])
    expect(options.markIndexed).not.toHaveBeenCalled()
  })

  it('re-reads the kill switch immediately before Vectorize and leaves the claim resumable', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events)
    options.admitProviderCall
      .mockResolvedValueOnce({
        providerAttemptId: 'workers-ai-attempt-1',
        reservationId: '77777777-7777-4777-8777-777777777777',
        controlRevision: 9
      })
      .mockRejectedValueOnce(new Error('crm_search_provider_disabled'))

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toThrow('crm_search_provider_disabled')

    expect(providerRuntime.ai.run).toHaveBeenCalledOnce()
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
    expect(options.returnToRetryable).toHaveBeenCalledOnce()
    expect(events.indexOf('settle_workers_ai')).toBeLessThan(events.indexOf('retryable'))
  })

  it('never sends a provider call before its durable attempt is stamped sent', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      markProviderCallSent: vi.fn().mockRejectedValue(
        new Error('crm_search_provider_attempt_changed')
      )
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toThrow('crm_search_provider_attempt_changed')
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
    expect(options.returnToRetryable).toHaveBeenCalledWith(expect.objectContaining({
      providerCallSent: false
    }))
    expect(options.settleProviderCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'workers_ai', providerCallSent: false, completionClass: 'released_no_call'
    }))
  })

  it('releases the Vectorize reservation if operation admission loses its CAS', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      admitOperation: vi.fn().mockRejectedValue(new Error('crm_search_admission_rejected'))
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toThrow('crm_search_admission_rejected')
    expect(options.settleProviderCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'vectorize', providerCallSent: false, completionClass: 'released_no_call'
    }))
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
  })

  it('fails closed instead of replaying a sent Workers AI attempt with ambiguous completion', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      loadProviderAttempt: vi.fn().mockResolvedValue({
        status: 'sent',
        provider: 'workers_ai',
        providerCallSent: true,
        reservationState: 'reserved',
        providerAttemptId: 'workers-ai-attempt-1',
        reservationId: '77777777-7777-4777-8777-777777777777'
      })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toThrow('crm_search_workers_ai_attempt_ambiguous')
    expect(options.markAmbiguousProviderOutcome).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'workers_ai',
      providerCallSent: true
    }))
    expect(options.admitProviderCall).not.toHaveBeenCalled()
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
  })

  it('suppresses a retiring-schema upsert before AI or Vectorize admission', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      loadCurrentContext: vi.fn().mockResolvedValue({
        source: { exists: true, deleted: false, revision: 7, eventSequence: 12 },
        schemaRole: 'retiring',
        canonicalNamespace: namespace,
        teardownId: null,
        documentAlreadyCurrent: false
      })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'superseded' })
    expect(options.markSuperseded).toHaveBeenCalledOnce()
    expect(options.admitProviderCall).not.toHaveBeenCalled()
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
  })

  it('suppresses an operation superseded by a newer source revision before admission', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      loadCurrentContext: vi.fn().mockResolvedValue({
        source: { exists: true, deleted: false, revision: 8, eventSequence: 13 },
        schemaRole: 'active',
        canonicalNamespace: namespace,
        teardownId: null,
        documentAlreadyCurrent: false
      })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'superseded' })
    expect(options.markSuperseded).toHaveBeenCalledOnce()
    expect(options.admitProviderCall).not.toHaveBeenCalled()
  })

  it('returns the claim to retryable when budget admission fails before any provider send', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      admitProviderCall: vi.fn().mockRejectedValue(new Error('crm_search_budget_exhausted'))
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toThrow('crm_search_budget_exhausted')
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
    expect(options.returnToRetryable).toHaveBeenCalledWith(expect.objectContaining({
      operationId,
      errorClass: 'budget_exhausted',
      providerCallSent: false
    }))
  })

  it('charges a sent Workers AI attempt and returns to retryable on provider timeout', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    providerRuntime.ai.run.mockRejectedValueOnce(new Error('provider timeout detail'))
    const options = dependencies(events)

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toMatchObject({ code: 'crm_search_workers_ai_failed' })
    expect(options.settleProviderCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'workers_ai',
      providerCallSent: true,
      completionClass: 'failed'
    }))
    expect(options.returnToRetryable).toHaveBeenCalledWith(expect.objectContaining({
      errorClass: 'workers_ai_failed',
      providerCallSent: true
    }))
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
  })

  it('turns a source moved to another client into deletion of the old client vector', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      loadCurrentContext: vi.fn().mockResolvedValue({
        source: {
          exists: true,
          deleted: false,
          clientId: '99999999-9999-4999-8999-999999999999',
          revision: 8,
          eventSequence: 13
        },
        schemaRole: 'active',
        canonicalNamespace: namespace,
        teardownId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        documentAlreadyCurrent: false
      })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.deleteByIds).toHaveBeenCalledWith([vectorId])
  })

  it('converts a missing or deleted source to a delete without calling Workers AI', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      loadCurrentContext: vi.fn().mockResolvedValue({
        source: { exists: false, deleted: true, revision: 7, eventSequence: 12 },
        schemaRole: 'active',
        canonicalNamespace: namespace,
        teardownId: '99999999-9999-4999-8999-999999999999',
        documentAlreadyCurrent: false
      }),
      claimOperation: vi.fn().mockResolvedValue(operation({ desiredAction: 'upsert' }))
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.deleteByIds).toHaveBeenCalledWith([vectorId])
    expect(options.admitProviderCall).toHaveBeenCalledTimes(1)
    expect(options.admitProviderCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'vectorize',
      action: 'delete',
      teardownId: '99999999-9999-4999-8999-999999999999'
    }))
  })

  it('does not replay an accepted Vectorize mutation after ambiguous finalization', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    let claimed = 0
    const options = dependencies(events, {
      claimOperation: vi.fn(async () => {
        claimed += 1
        return operation(claimed === 1
          ? {}
          : { state: 'admitted', providerAdmittedAt: '2026-08-10T00:00:00.000Z' })
      }),
      recordProviderAcceptance: vi.fn().mockRejectedValueOnce(
        new Error('crm_search_ambiguous_commit')
      ),
      loadProviderAttempt: vi.fn(async () => claimed === 1
        ? null
        : {
            status: 'ambiguous',
            provider: 'vectorize',
            providerCallSent: true,
            reservationState: 'charged'
          })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })
    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })

    expect(providerRuntime.vectorize.upsert).toHaveBeenCalledOnce()
    expect(options.markAmbiguousProviderOutcome).toHaveBeenCalledOnce()
    expect(options.settleProviderCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'vectorize',
      providerCallSent: true
    }))
  })

  it('treats an uncertain Vectorize send as reconciliation-only work, never a blind retry', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    providerRuntime.vectorize.upsert.mockRejectedValueOnce(new Error('provider timeout'))
    const options = dependencies(events)

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })
    expect(options.markAmbiguousProviderOutcome).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'vectorize', providerCallSent: true
    }))
    expect(options.settleProviderCall).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'vectorize', completionClass: 'failed'
    }))
    expect(options.returnToRetryable).not.toHaveBeenCalled()
  })
})
