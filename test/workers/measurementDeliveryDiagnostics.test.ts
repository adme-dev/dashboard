import { describe, expect, it, vi } from 'vitest'

import {
  deriveTikTokTestHealth,
  retrieveGoogleDataManagerRequestStatus
} from '../../workers/measurement-delivery/src/diagnostics'

describe('TikTok Test Events diagnostics', () => {
  it('maps fresh accepted test evidence to ready without exposing provider data', () => {
    expect(deriveTikTokTestHealth({
      status: 'accepted',
      completedAt: '2026-07-17T08:00:00.000Z',
      errorClass: null
    }, new Date('2026-07-17T09:00:00.000Z'))).toEqual({
      healthStatus: 'ready',
      evidenceAt: '2026-07-17T08:00:00.000Z',
      reason: null
    })
  })

  it('degrades stale or pending TikTok test evidence with stable reasons', () => {
    expect(deriveTikTokTestHealth({
      status: 'accepted',
      completedAt: '2026-07-15T08:00:00.000Z',
      errorClass: null
    }, new Date('2026-07-17T09:00:00.000Z'))).toEqual({
      healthStatus: 'degraded',
      evidenceAt: '2026-07-15T08:00:00.000Z',
      reason: 'tiktok_test_evidence_stale'
    })
    expect(deriveTikTokTestHealth({
      status: 'requested',
      completedAt: null,
      errorClass: null
    }, new Date('2026-07-17T09:00:00.000Z'))).toMatchObject({
      healthStatus: 'degraded',
      reason: 'tiktok_test_evidence_pending'
    })
  })

  it('blocks configuration failures but degrades transient provider failures', () => {
    expect(deriveTikTokTestHealth({
      status: 'failed',
      completedAt: '2026-07-17T08:00:00.000Z',
      errorClass: 'tiktok_events_api_credential_unavailable'
    }, new Date('2026-07-17T09:00:00.000Z'))).toMatchObject({
      healthStatus: 'blocked',
      reason: 'tiktok_events_api_credential_unavailable'
    })
    expect(deriveTikTokTestHealth({
      status: 'failed',
      completedAt: '2026-07-17T08:00:00.000Z',
      errorClass: 'provider_http_503'
    }, new Date('2026-07-17T09:00:00.000Z'))).toMatchObject({
      healthStatus: 'degraded',
      reason: 'tiktok_test_delivery_transient'
    })
  })
})

describe('Google Data Manager delivery diagnostics', () => {
  it('aggregates terminal success and preserves warning counts without raw payloads', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestStatusPerDestination: [{
        requestStatus: 'SUCCESS',
        warningInfo: {
          warningCounts: [{
            reason: 'PROCESSING_WARNING_REASON_INTERNAL_ERROR',
            recordCount: '2'
          }]
        }
      }]
    }), { status: 200 }))

    await expect(retrieveGoogleDataManagerRequestStatus({
      requestId: 'request-123',
      accessToken: 'secret-token',
      fetch
    })).resolves.toEqual({
      outcome: 'success',
      warningCount: 2,
      errorCount: 0,
      reason: 'PROCESSING_WARNING_REASON_INTERNAL_ERROR',
      retryable: false
    })
    expect(fetch).toHaveBeenCalledWith(
      'https://datamanager.googleapis.com/v1/requestStatus:retrieve?requestId=request-123',
      expect.objectContaining({
        method: 'GET',
        headers: { authorization: 'Bearer secret-token' }
      })
    )
  })

  it('treats processing as non-terminal and partial success as terminal failure evidence', async () => {
    const processingFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestStatusPerDestination: [{ requestStatus: 'PROCESSING' }]
    }), { status: 200 }))
    await expect(retrieveGoogleDataManagerRequestStatus({
      requestId: 'processing-id',
      accessToken: 'token',
      fetch: processingFetch
    })).resolves.toMatchObject({ outcome: 'processing', retryable: true })

    const partialFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      requestStatusPerDestination: [{
        requestStatus: 'PARTIAL_SUCCESS',
        errorInfo: {
          errorCounts: [{
            reason: 'PROCESSING_ERROR_REASON_INVALID_GCLID',
            recordCount: '1'
          }]
        }
      }]
    }), { status: 200 }))
    await expect(retrieveGoogleDataManagerRequestStatus({
      requestId: 'partial-id',
      accessToken: 'token',
      fetch: partialFetch
    })).resolves.toEqual({
      outcome: 'partial_success',
      warningCount: 0,
      errorCount: 1,
      reason: 'PROCESSING_ERROR_REASON_INVALID_GCLID',
      retryable: false
    })
  })

  it('classifies transient HTTP failures without exposing the provider body', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('contains-sensitive-provider-detail', {
      status: 503
    }))

    await expect(retrieveGoogleDataManagerRequestStatus({
      requestId: 'request-503',
      accessToken: 'secret-token',
      fetch
    })).resolves.toEqual({
      outcome: 'http_failure',
      warningCount: 0,
      errorCount: 0,
      reason: 'provider_http_503',
      retryable: true
    })
  })
})
