import { describe, expect, it, vi } from 'vitest'

import {
  processCrmSearchOperation,
  reserveCrmSearchProcessRequest,
  withCrmSearchProviderCallGuard
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

function currentGuardSnapshot(overrides: Record<string, unknown> = {}) {
  return {
    disposition: 'current',
    source: {
      exists: true,
      deleted: false,
      clientId,
      revision: 7,
      eventSequence: 12,
      document: {
        canonicalText: 'Name: Atlas Motors',
        providerInput: 'Name: Atlas Motors',
        contentHash: 'b'.repeat(64)
      }
    },
    documentAlreadyCurrent: false,
    ledger: null,
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
    convertOperationToDelete: vi.fn(async () => {
      events.push('persist_delete')
    }),
    withProviderCallGuard: vi.fn(async (
      input: { provider: string },
      callback: (snapshot: ReturnType<typeof currentGuardSnapshot>) => Promise<unknown>
    ) => {
      events.push(`guard_${input.provider}_open`)
      try {
        return await callback(currentGuardSnapshot())
      } finally {
        events.push(`guard_${input.provider}_close`)
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
  it('holds fresh shared client and row authority throughout the provider callback', async () => {
    let transactionActive = false
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        state: 'enabled', indexing_ready: true, revision: '9'
      }] })
      .mockResolvedValueOnce({ rows: [{
        lifecycle_state: 'indexing', indexing_enabled: true, revision: '12',
        active_schema_version: 'crm-search-v1', candidate_schema_version: null,
        retiring_schema_versions: []
      }] })
      .mockResolvedValueOnce({ rows: [{
        metadata_index_state: 'ready', sentinel_state: 'confirmed_absent'
      }] })
      .mockResolvedValueOnce({ rows: [{
        id: operationId,
        organisation_scope_id: organisationScopeId,
        client_id: clientId,
        entity_type: 'company',
        entity_id: entityId,
        schema_version: 'crm-search-v1',
        source_revision: '7',
        source_event_sequence: '12',
        desired_action: 'upsert',
        namespace,
        content_hash: 'b'.repeat(64),
        confirmation_tag: confirmationTag,
        confirmation_key_version: 'k1',
        state: 'processing',
        lease_token: '66666666-6666-4666-8666-666666666666',
        lease_generation: '3'
      }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        client_id: clientId,
        search_revision: '7',
        deleted_at: null,
        name: 'Atlas Motors',
        domain: null,
        lifecycle_stage: null
      }] })
      .mockResolvedValueOnce({ rows: [] })
    const transactionWithoutRetry = vi.fn(async (callback) => {
      transactionActive = true
      try {
        return await callback({ query })
      } finally {
        transactionActive = false
      }
    })
    const providerCall = vi.fn(async (snapshot) => {
      expect(transactionActive).toBe(true)
      expect(query).toHaveBeenCalledTimes(8)
      expect(snapshot).toMatchObject({
        disposition: 'current',
        source: { clientId, revision: 7, eventSequence: 12 }
      })
      return 'accepted'
    })

    await expect(withCrmSearchProviderCallGuard({
      organisationScopeId,
      clientId,
      provider: 'vectorize',
      action: 'upsert',
      schemaVersion: 'crm-search-v1',
      teardownId: null,
      operationId,
      entityType: 'company',
      entityId,
      sourceRevision: 7,
      sourceEventSequence: 12,
      namespace,
      contentHash: 'b'.repeat(64),
      leaseToken: '66666666-6666-4666-8666-666666666666',
      leaseGeneration: 3
    }, providerCall, {
      transactionWithoutRetry,
      buildDocument: vi.fn(async () => ({
        canonicalText: 'Name: Atlas Motors',
        providerInput: 'Name: Atlas Motors',
        contentHash: 'b'.repeat(64)
      }))
    } as never)).resolves.toBe('accepted')

    expect(transactionActive).toBe(false)
    expect(query.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock_shared')
    expect(query.mock.calls[1]?.[0]).toContain('crm_search_global_control')
    expect(query.mock.calls[1]?.[0]).toContain('FOR SHARE')
    expect(query.mock.calls[2]?.[0]).toContain('crm_search_policies')
    expect(query.mock.calls[3]?.[0]).toContain('crm_search_schema_versions')
    expect(query.mock.calls[4]?.[0]).toContain('crm_search_operations')
    expect(query.mock.calls[4]?.[0]).toContain('FOR KEY SHARE')
    expect(query.mock.calls[5]?.[0]).toContain('crm_search_source_dirty')
    expect(query.mock.calls[5]?.[0]).toContain('FOR SHARE')
    expect(query.mock.calls[6]?.[0]).toContain('crm_companies')
    expect(query.mock.calls[6]?.[0]).toContain('FOR SHARE')
    expect(query.mock.calls[7]?.[0]).toContain('crm_search_documents')
    expect(query.mock.calls[7]?.[0]).toContain('FOR SHARE')
  })

  it('supersedes a source revision captured after initial context but before Workers AI', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    const options = dependencies(events, {
      withProviderCallGuard: vi.fn(async (
        _input: unknown,
        callback: (snapshot: ReturnType<typeof currentGuardSnapshot>) => Promise<unknown>
      ) => callback(currentGuardSnapshot({
        disposition: 'superseded',
        source: {
          exists: true,
          deleted: false,
          clientId,
          revision: 8,
          eventSequence: 13
        }
      })))
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'superseded' })

    expect(options.markSuperseded).toHaveBeenCalledWith(expect.objectContaining({
      reason: 'newer_source_intent'
    }))
    expect(options.admitProviderCall).not.toHaveBeenCalled()
    expect(providerRuntime.ai.run).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
  })

  it('converts a source move between AI and Vectorize into a freshly guarded delete', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    let vectorGuardCount = 0
    const options = dependencies(events, {
      withProviderCallGuard: vi.fn(async (
        input: { provider: string, action: string },
        callback: (snapshot: ReturnType<typeof currentGuardSnapshot>) => Promise<unknown>
      ) => {
        if (input.provider === 'workers_ai') return callback(currentGuardSnapshot())
        vectorGuardCount += 1
        return callback(vectorGuardCount === 1
          ? currentGuardSnapshot({
              disposition: 'delete',
              source: {
                exists: true,
                deleted: false,
                clientId: '99999999-9999-4999-8999-999999999999',
                revision: 8,
                eventSequence: 13
              }
            })
          : currentGuardSnapshot({
              source: {
                exists: true,
                deleted: false,
                clientId: '99999999-9999-4999-8999-999999999999',
                revision: 8,
                eventSequence: 13
              }
            }))
      })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .resolves.toEqual({ status: 'accepted_provider_pending' })

    expect(providerRuntime.ai.run).toHaveBeenCalledOnce()
    expect(providerRuntime.vectorize.upsert).not.toHaveBeenCalled()
    expect(providerRuntime.vectorize.deleteByIds).toHaveBeenCalledWith([vectorId])
    expect(options.convertOperationToDelete).toHaveBeenCalledOnce()
    expect(options.admitProviderCall).toHaveBeenLastCalledWith(expect.objectContaining({
      provider: 'vectorize', action: 'delete'
    }))
  })

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
      'guard_workers_ai_open',
      'admit_workers_ai',
      'sent_workers_ai',
      'workers_ai',
      'settle_workers_ai',
      'guard_workers_ai_close',
      'guard_vectorize_open',
      'admit_vectorize',
      'admit_operation',
      'sent_vectorize',
      'vectorize_upsert',
      'guard_vectorize_close',
      'provider_pending',
      'settle_vectorize'
    ])
    expect(options.markIndexed).not.toHaveBeenCalled()
    expect(options.admitProviderCall).toHaveBeenLastCalledWith(expect.objectContaining({
      provider: 'vectorize',
      action: 'upsert',
      insertedDimensions: 768,
      storedDimensions: 0
    }))
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

  it('marks a post-sent Workers AI error ambiguous and charged without blind replay', async () => {
    const events: string[] = []
    const providerRuntime = runtime(events)
    providerRuntime.ai.run.mockRejectedValueOnce(new Error('provider timeout detail'))
    const options = dependencies(events, {
      loadProviderAttempt: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          status: 'ambiguous',
          provider: 'workers_ai',
          providerCallSent: true,
          reservationState: 'charged',
          providerAttemptId: 'workers-ai-attempt-1',
          reservationId: '77777777-7777-4777-8777-777777777777'
        })
    })

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toMatchObject({ code: 'crm_search_workers_ai_failed' })
    expect(options.markAmbiguousProviderOutcome).toHaveBeenCalledOnce()
    expect(events.indexOf('ambiguous')).toBeLessThan(events.indexOf('settle_workers_ai'))
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

    await expect(processCrmSearchOperation(operationId, providerRuntime as never, options as never))
      .rejects.toThrow('crm_search_workers_ai_attempt_ambiguous')
    expect(providerRuntime.ai.run).toHaveBeenCalledOnce()
    expect(options.markAmbiguousProviderOutcome).toHaveBeenCalledOnce()
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
    expect(options.convertOperationToDelete).toHaveBeenCalledWith({
      operationId,
      sourceRevision: 7,
      sourceEventSequence: 12,
      leaseToken: '66666666-6666-4666-8666-666666666666',
      leaseGeneration: 3
    })
    expect(events.indexOf('persist_delete')).toBeLessThan(events.indexOf('admit_vectorize'))
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
