import { describe, expect, it, vi } from 'vitest'

import {
  recordCrmSearchDeadLetter,
  reserveCrmSearchDeadLetterRequest,
  requestCrmSearchDeadLetterRecovery
} from '~~/server/utils/crm/searchIndex/deadLetters'

const deadLetterId = '11111111-1111-4111-8111-111111111111'
const operationId = '22222222-2222-4222-8222-222222222222'
const correlationId = '33333333-3333-4333-8333-333333333333'
const actorId = '44444444-4444-4444-8444-444444444444'

describe('CRM search dead-letter lifecycle', () => {
  it('reserves transport persistence only when no durable origin already owns the operation', async () => {
    const queryOneFresh = vi.fn()
      .mockResolvedValueOnce({ id: operationId, origin: null })
      .mockResolvedValueOnce({ id: operationId, origin: 'cloudflare_transport' })
      .mockResolvedValueOnce({ id: operationId, origin: 'provider_confirmation' })
    const input = { operationId, correlationId, protocolVersion: 1 as const }

    await expect(reserveCrmSearchDeadLetterRequest(input, { queryOneFresh } as never))
      .resolves.toEqual({ status: 'reserved' })
    await expect(reserveCrmSearchDeadLetterRequest(input, { queryOneFresh } as never))
      .resolves.toEqual({ status: 'replay', outcome: { status: 'recorded' } })
    await expect(reserveCrmSearchDeadLetterRequest(input, { queryOneFresh } as never))
      .resolves.toEqual({ status: 'in_progress' })
  })

  it('records Cloudflare delivery exhaustion only as transport origin with a redacted error class', async () => {
    const persist = vi.fn().mockResolvedValue({ id: deadLetterId, duplicate: false })

    await expect(recordCrmSearchDeadLetter({
      operationId,
      correlationId,
      origin: 'cloudflare_transport',
      attempts: 6,
      errorClass: 'queue_delivery_exhausted'
    }, { persist } as never)).resolves.toEqual({ status: 'recorded' })

    expect(persist).toHaveBeenCalledWith({
      operationId,
      correlationId,
      origin: 'cloudflare_transport',
      attempts: 6,
      errorClass: 'queue_delivery_exhausted'
    })
    expect(JSON.stringify(persist.mock.calls)).not.toMatch(/provider detail|sourceText|query|stack/i)
  })

  it('is idempotent for the same operation and origin but rejects a conflicting origin', async () => {
    const sameOrigin = vi.fn().mockResolvedValue({ id: deadLetterId, duplicate: true })
    await expect(recordCrmSearchDeadLetter({
      operationId,
      correlationId,
      origin: 'provider_confirmation',
      attempts: 10,
      errorClass: 'confirmation_exhausted'
    }, { persist: sameOrigin } as never)).resolves.toEqual({ status: 'recorded' })

    const conflictingOrigin = vi.fn().mockRejectedValue(
      new Error('crm_search_dead_letter_origin_conflict')
    )
    await expect(recordCrmSearchDeadLetter({
      operationId,
      correlationId,
      origin: 'cloudflare_transport',
      attempts: 7,
      errorClass: 'queue_delivery_exhausted'
    }, { persist: conflictingOrigin } as never)).rejects.toThrow(
      'crm_search_dead_letter_origin_conflict'
    )
  })

  it.each([
    {
      origin: 'cloudflare_transport' as const,
      action: 'transport_retry' as const,
      transition: 'transport_retry_requested'
    },
    {
      origin: 'provider_confirmation' as const,
      action: 'confirmation_reconcile' as const,
      transition: 'confirmation_reconcile_requested'
    }
  ])('permits only the audited recovery action owned by $origin', async ({ origin, action, transition }) => {
    const loadForUpdate = vi.fn().mockResolvedValue({
      id: deadLetterId,
      operationId,
      origin,
      resolutionState: 'open'
    })
    const transitionRecovery = vi.fn().mockResolvedValue(transition)

    await expect(requestCrmSearchDeadLetterRecovery({
      deadLetterId,
      expectedOrigin: origin,
      action,
      actorId,
      reason: 'Retry requested after bounded operator investigation.'
    }, { loadForUpdate, transitionRecovery } as never)).resolves.toEqual({
      status: transition
    })

    expect(transitionRecovery).toHaveBeenCalledWith(expect.objectContaining({
      deadLetterId,
      operationId,
      origin,
      action,
      actorId
    }))
  })

  it.each([
    ['cloudflare_transport', 'confirmation_reconcile'],
    ['provider_confirmation', 'transport_retry']
  ] as const)('rejects %s dead letters using the %s recovery path', async (origin, action) => {
    const transitionRecovery = vi.fn()
    const loadForUpdate = vi.fn().mockResolvedValue({
      id: deadLetterId,
      operationId,
      origin,
      resolutionState: 'open'
    })

    await expect(requestCrmSearchDeadLetterRecovery({
      deadLetterId,
      expectedOrigin: origin,
      action,
      actorId,
      reason: 'Retry requested after bounded operator investigation.'
    } as never, { loadForUpdate, transitionRecovery } as never)).rejects.toThrow(
      'crm_search_dead_letter_action_mismatch'
    )
    expect(transitionRecovery).not.toHaveBeenCalled()
  })
})
