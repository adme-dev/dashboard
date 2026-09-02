import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import {
  createDealerEvidenceService,
  DealerEvidenceError
} from '~~/server/utils/measurement/dealerEvidence'

const CLIENT_ID = 'efd1e1c6-f227-4b2f-b36d-19880bdba0e0'
const ENDPOINT = {
  id: '11111111-1111-4111-8111-111111111111',
  clientId: CLIENT_ID,
  profileId: '22222222-2222-4222-8222-222222222222',
  endpointKey: 'northern-gac-evidence-endpoint-key-001',
  sourceSystem: 'dealer_platform',
  status: 'test' as const,
  replayWindowSeconds: 300,
  rateLimitPerMinute: 60,
  trackingSiteId: 'northern-gac-site',
  currentSecret: 'current-secret',
  previousSecret: null,
  previousSecretValidUntil: null,
  allowServerDelivery: false,
  browserServerDedupValidated: false
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    version: 'dealer.measurement.evidence.v1',
    clientId: CLIENT_ID,
    siteId: 'northern-gac-site',
    eventId: 'evt-100',
    browserTransactionId: 'browser-tx-100',
    event: { name: 'web_conversion', enquiryType: 'stock', value: 1, currency: 'AUD' },
    occurredAt: '2026-09-02T04:59:30.000Z',
    consent: { analytics: 'granted', advertising: 'granted' },
    evidence: [
      { stage: 'captured', outcome: 'observed', occurredAt: '2026-09-02T04:59:30.000Z' },
      { stage: 'delivery_attempted', outcome: 'delivered', destination: 'google_ads', channel: 'browser' }
    ],
    ...overrides
  }
}

function signedRequest(body: unknown, overrides: Record<string, string> = {}) {
  const rawBody = JSON.stringify(body)
  const timestamp = '1788325200'
  const nonce = 'nonce-100'
  const signature = createHmac('sha256', ENDPOINT.currentSecret)
    .update(`v1.${timestamp}.${nonce}.${ENDPOINT.endpointKey}.${rawBody}`)
    .digest('hex')
  return {
    endpointKey: ENDPOINT.endpointKey,
    rawBody,
    headers: {
      timestamp,
      nonce,
      signature,
      ...overrides
    }
  }
}

function service(
  persist = vi.fn(async () => ({ status: 'created' as const })),
  consumeRateLimit = vi.fn(async () => true)
) {
  return {
    persist,
    value: createDealerEvidenceService({
      resolveEndpoint: vi.fn(async () => ENDPOINT),
      consumeRateLimit,
      persist,
      now: () => new Date('2026-09-02T05:00:00.000Z')
    })
  }
}

describe('dealer measurement evidence contract', () => {
  it('accepts signed, client-bound, privacy-minimized evidence', async () => {
    const { value, persist } = service()

    await expect(value.ingest(signedRequest(payload()))).resolves.toEqual({
      status: 'accepted', eventId: 'evt-100', duplicate: false
    })
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      endpoint: expect.objectContaining({ clientId: CLIENT_ID }),
      payload: expect.objectContaining({ siteId: 'northern-gac-site' }),
      nonce: 'nonce-100'
    }))
  })

  it('returns the same acknowledgement for an idempotent duplicate', async () => {
    const { value } = service(vi.fn(async () => ({ status: 'duplicate' as const })))
    await expect(value.ingest(signedRequest(payload()))).resolves.toEqual({
      status: 'accepted', eventId: 'evt-100', duplicate: true
    })
  })

  it('rejects invalid signatures without disclosing binding details', async () => {
    const { value } = service()
    await expect(value.ingest(signedRequest(payload(), { signature: '0'.repeat(64) })))
      .rejects.toMatchObject({ code: 'invalid_signature', statusCode: 401 })
  })

  it('rejects replayed nonces and stale timestamps', async () => {
    const { value: replay } = service(vi.fn(async () => ({ status: 'replay' as const })))
    await expect(replay.ingest(signedRequest(payload())))
      .rejects.toMatchObject({ code: 'replay_detected', statusCode: 409 })

    const { value: stale } = service()
    await expect(stale.ingest(signedRequest(payload(), { timestamp: '1788324000' })))
      .rejects.toMatchObject({ code: 'timestamp_outside_window', statusCode: 401 })
  })

  it('fails closed when the signed endpoint exceeds its configured request limit', async () => {
    const consumeRateLimit = vi.fn(async () => false)
    const { value, persist } = service(
      vi.fn(async () => ({ status: 'created' as const })),
      consumeRateLimit
    )

    await expect(value.ingest(signedRequest(payload())))
      .rejects.toMatchObject({ code: 'rate_limited', statusCode: 429 })
    expect(consumeRateLimit).toHaveBeenCalledWith(ENDPOINT)
    expect(persist).not.toHaveBeenCalled()
  })

  it('rejects client and site mismatches before persistence', async () => {
    const { value, persist } = service()
    await expect(value.ingest(signedRequest(payload({
      clientId: '33333333-3333-4333-8333-333333333333'
    })))).rejects.toMatchObject({ code: 'binding_mismatch', statusCode: 403 })
    await expect(value.ingest(signedRequest(payload({ siteId: 'other-site' }))))
      .rejects.toMatchObject({ code: 'binding_mismatch', statusCode: 403 })
    expect(persist).not.toHaveBeenCalled()
  })

  it('fails closed when advertising delivery contradicts denied consent', async () => {
    const { value } = service()
    await expect(value.ingest(signedRequest(payload({
      consent: { analytics: 'granted', advertising: 'denied' }
    })))).rejects.toMatchObject({ code: 'consent_violation', statusCode: 422 })
  })

  it('keeps server delivery dormant until shared-transaction deduplication is validated', async () => {
    const body = payload({
      evidence: [{
        stage: 'delivery_attempted', outcome: 'delivered', destination: 'google_ads', channel: 'server'
      }]
    })
    const { value } = service()
    await expect(value.ingest(signedRequest(body)))
      .rejects.toMatchObject({ code: 'server_delivery_not_approved', statusCode: 422 })
  })

  it('rejects raw PII and click identifiers outside the versioned contract', async () => {
    for (const forbidden of [{ email: 'person@example.com' }, { gclid: 'raw-click-id' }]) {
      const { value } = service()
      await expect(value.ingest(signedRequest(payload(forbidden))))
        .rejects.toBeInstanceOf(DealerEvidenceError)
    }
  })
})
