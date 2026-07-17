import { describe, expect, it, vi } from 'vitest'

import { createMeasurementDiagnosticReconciler } from '../../workers/measurement-delivery/src/diagnosticReconciler'

const scope = 'https://www.googleapis.com/auth/datamanager'
const now = new Date('2026-07-17T01:00:00.000Z')

function claim(overrides: Record<string, unknown> = {}) {
  return {
    clientId: 'client-1',
    deliveryId: 'delivery-1',
    destinationId: 'destination-1',
    requestId: 'request-1',
    startedAt: '2026-07-17T00:00:00.000Z',
    checkNumber: 1,
    workerId: 'diagnostic-worker',
    refreshToken: 'refresh-secret',
    connectionScopes: [scope],
    ...overrides
  }
}

function setup(claims: Array<ReturnType<typeof claim>>) {
  const claimNext = vi.fn()
    .mockImplementation(async () => claims.shift() ?? null)
  const complete = vi.fn().mockResolvedValue(undefined)
  const retrieve = vi.fn().mockResolvedValue({
    outcome: 'success',
    warningCount: 0,
    errorCount: 0,
    reason: null,
    retryable: false
  })
  const refresh = vi.fn().mockResolvedValue('access-secret')
  const reconciler = createMeasurementDiagnosticReconciler({
    repository: { claimNext, complete },
    retrieve,
    refreshGoogleAccessToken: refresh,
    workerId: () => 'diagnostic-worker',
    now: () => now,
    random: () => 0.5,
    googleClientId: 'client-id',
    googleClientSecret: 'client-secret',
    fetch: vi.fn()
  })
  return { reconciler, claimNext, complete, retrieve, refresh }
}

describe('measurement delivery diagnostic reconciler', () => {
  it('marks clean success delivered and warning-bearing success degraded', async () => {
    const first = claim()
    const second = claim({ deliveryId: 'delivery-2', checkNumber: 2 })
    const { reconciler, complete, retrieve } = setup([first, second])
    retrieve
      .mockResolvedValueOnce({
        outcome: 'success', warningCount: 0, errorCount: 0, reason: null, retryable: false
      })
      .mockResolvedValueOnce({
        outcome: 'success', warningCount: 2, errorCount: 0,
        reason: 'PROCESSING_WARNING_REASON_INTERNAL_ERROR', retryable: false
      })

    await expect(reconciler.reconcile()).resolves.toEqual({
      checked: 2, delivered: 2, processing: 0, failed: 0
    })
    expect(complete).toHaveBeenNthCalledWith(1, first, expect.objectContaining({
      outcome: 'success', errorClass: null, nextCheckAt: null
    }), now)
    expect(complete).toHaveBeenNthCalledWith(2, second, expect.objectContaining({
      outcome: 'success', errorClass: 'google_diagnostics_warning', warningCount: 2
    }), now)
  })

  it('reschedules processing with official backoff before the 24-hour deadline', async () => {
    const due = claim({ checkNumber: 1 })
    const { reconciler, complete, retrieve } = setup([due])
    retrieve.mockResolvedValue({
      outcome: 'processing', warningCount: 0, errorCount: 0, reason: null, retryable: true
    })

    await reconciler.reconcile()
    expect(complete).toHaveBeenCalledWith(due, expect.objectContaining({
      outcome: 'processing',
      nextCheckAt: '2026-07-17T01:39:00.000Z'
    }), now)
  })

  it('times out after 24 hours without calling Google again', async () => {
    const expired = claim({ startedAt: '2026-07-16T00:59:59.000Z' })
    const { reconciler, complete, retrieve, refresh } = setup([expired])

    await expect(reconciler.reconcile()).resolves.toMatchObject({ failed: 1 })
    expect(refresh).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(expired, expect.objectContaining({
      outcome: 'timed_out',
      errorClass: 'google_diagnostics_timeout',
      nextCheckAt: null
    }), now)
  })

  it('fails closed when the connection cannot authorize diagnostics', async () => {
    const missingScope = claim({ connectionScopes: [] })
    const { reconciler, complete, retrieve } = setup([missingScope])

    await reconciler.reconcile()
    expect(retrieve).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledWith(missingScope, expect.objectContaining({
      outcome: 'credential_failure',
      errorClass: 'google_datamanager_reconsent_required'
    }), now)
  })
})
