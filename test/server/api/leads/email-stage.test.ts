import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, queryOne, transaction } = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn()
}))

transaction.mockImplementation(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))

vi.mock('~~/server/utils/db', () => ({ queryOne, transaction }))
import {
  confirmEmailIngestionStage,
  reserveEmailIngestionStage
} from '../../../../server/utils/leads/emailIngestion'

const HASH = 'a'.repeat(64)
const LEGACY_HASH = 'b'.repeat(64)
const RAW_CONTENT_HASH = 'c'.repeat(64)
const CORRELATION_ID = '33333333-3333-4333-8333-333333333333'
const endpoint = {
  id: '11111111-1111-4111-8111-111111111111', client_id: '22222222-2222-4222-8222-222222222222',
  form_id: 'email_endpoint:11111111-1111-4111-8111-111111111111', form_name: 'Carsales', enabled: true, retired_at: null,
  address_token: '0123456789', previous_address_token: null, previous_token_grace_until: null,
  expected_provider: 'carsales', parser_mode: 'auto', ai_extraction_mode: 'disabled',
  allowed_sender_domains: [], lead_capture_mode: 'full_crm'
}

function request() {
  return {
    schemaVersion: 1 as const, correlationId: CORRELATION_ID,
    transport: 'cloudflare_email_routing' as const, recipientToken: '0123456789', externalIdHash: HASH,
    legacyExternalIdHash: LEGACY_HASH, messageIdHash: HASH,
    rawContentHashVersion: 1 as const, rawContentHash: RAW_CONTENT_HASH,
    provider: 'carsales', receivedAt: '2026-07-29T00:00:00.000Z', rawSize: 128,
    envelopeSenderDomain: 'notify.carsales.com.au', headerFromDomain: 'carsales.com.au',
    safeEvidence: { hasText: true, hasHtml: false, hasAdf: false, fieldKeys: ['full_name'] },
    quarantineExpiresAt: '2099-08-05T00:00:00.000Z'
  }
}

function liveReservation(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    endpoint_id: endpoint.id,
    client_id: endpoint.client_id,
    correlation_id: CORRELATION_ID,
    transport: 'cloudflare_email_routing',
    external_id_hash: HASH,
    message_id_hash: HASH,
    provider: 'carsales',
    sender_domain: 'notify.carsales.com.au',
    header_from_domain: 'carsales.com.au',
    raw_size: 128,
    raw_content_hash_version: 1,
    raw_content_hash: RAW_CONTENT_HASH,
    terminal_at: null,
    staged_expires_at: '2099-08-05T00:00:00.000Z',
    staged_expired: false,
    staged_object_key: 'email-ingestions/existing-opaque-key',
    ...overrides
  }
}

describe('email stage reservation', () => {
  beforeEach(() => { query.mockReset(); queryOne.mockReset(); transaction.mockClear() })

  it('issues a random opaque key only for a non-terminal endpoint-scoped reservation', async () => {
    await expect(reserveEmailIngestionStage({} as never)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('persists only safe hashes and reuses a non-terminal reservation key on retry', async () => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '44444444-4444-4444-8444-444444444444',
        correlation_id: CORRELATION_ID
      }] })
    const first = await reserveEmailIngestionStage(request())
    expect(first).toMatchObject({
      outcome: 'reserved',
      correlationId: CORRELATION_ID,
      ingestionId: '44444444-4444-4444-8444-444444444444'
    })
    expect(first.encryptedObjectKey).toMatch(/^email-ingestions\/[a-f0-9]{64}$/)
    expect(JSON.stringify(query.mock.calls[2]?.[1])).not.toContain('Jane Example')
    expect(query.mock.calls[2]?.[0]).toContain('sender_domain')
    expect(query.mock.calls[2]?.[0]).toMatch(/staged_expires_at, next_attempt_at[\s\S]*\$15::timestamptz,[\s\S]*MAKE_INTERVAL/)
    expect(query.mock.calls[2]?.[1]).toContain('notify.carsales.com.au')

    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [liveReservation({
      id: first.ingestionId,
      staged_object_key: first.encryptedObjectKey
    })] })
    await expect(reserveEmailIngestionStage(request())).resolves.toEqual(first)
  })

  it('returns a terminal duplicate without issuing another raw-object key', async () => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [{
      id: '44444444-4444-4444-8444-444444444444',
      correlation_id: CORRELATION_ID,
      status: 'accepted',
      terminal_at: '2026-07-29T01:00:00.000Z',
      staged_object_key: 'email-ingestions/previous-reservation-key'
    }] })
    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'duplicate',
      correlationId: CORRELATION_ID,
      ingestionId: '44444444-4444-4444-8444-444444444444',
      cleanupObjectKey: 'email-ingestions/previous-reservation-key'
    })
  })

  it('retains quarantined evidence instead of asking a redelivery to delete it', async () => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [{
      id: '44444444-4444-4444-8444-444444444444',
      correlation_id: CORRELATION_ID,
      status: 'quarantined',
      terminal_at: '2026-07-29T01:00:00.000Z',
      staged_object_key: 'email-ingestions/retained-quarantine'
    }] })
    await expect(reserveEmailIngestionStage(request())).resolves.toMatchObject({
      outcome: 'duplicate',
      cleanupObjectKey: null
    })
  })

  it('hands an expired reservation to audited recovery instead of terminalizing it unaudited', async () => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [liveReservation({
      status: 'received',
      staged_expires_at: '2026-07-28T00:00:00.000Z',
      staged_expired: true,
      staged_object_key: 'email-ingestions/expired-reservation-key'
    })] }).mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444' }] })

    await expect(reserveEmailIngestionStage(request())).resolves.toMatchObject({
      outcome: 'duplicate',
      cleanupObjectKey: null
    })
    expect(query.mock.calls[2]?.[0]).toMatch(
      /status = 'failed'[\s\S]*error_class = 'evidence_expired'[\s\S]*terminal_at = NULL[\s\S]*next_attempt_at = NOW\(\)/
    )
  })

  it('makes a reservation recoverable only after the exact R2 upload is confirmed', async () => {
    queryOne.mockResolvedValueOnce({ id: '44444444-4444-4444-8444-444444444444' })
    await expect(confirmEmailIngestionStage({
      schemaVersion: 1,
      ingestionId: '44444444-4444-4444-8444-444444444444',
      correlationId: CORRELATION_ID,
      encryptedObjectKey: 'email-ingestions/opaque-key-123456',
      rawContentHashVersion: 1,
      rawContentHash: RAW_CONTENT_HASH
    })).resolves.toEqual({ schemaVersion: 1, status: 'confirmed' })
    expect(queryOne.mock.calls[0]?.[0]).toMatch(/staged_uploaded_at = COALESCE\(staged_uploaded_at, NOW\(\)\)/)
    expect(queryOne.mock.calls[0]?.[0]).toMatch(/next_attempt_at = NOW\(\)/)
    expect(queryOne.mock.calls[0]?.[0]).toMatch(/correlation_id = \$2[\s\S]*staged_object_key = \$3/)
  })

  it('rejects upload confirmation after the fixed evidence expiry', async () => {
    queryOne.mockResolvedValueOnce(null)
    await expect(confirmEmailIngestionStage({
      schemaVersion: 1,
      ingestionId: '44444444-4444-4444-8444-444444444444',
      correlationId: CORRELATION_ID,
      encryptedObjectKey: 'email-ingestions/opaque-key-123456',
      rawContentHashVersion: 1,
      rawContentHash: RAW_CONTENT_HASH
    })).rejects.toMatchObject({ statusCode: 409 })
    expect(queryOne.mock.calls[0]?.[0]).toMatch(/staged_expires_at > NOW\(\)/)
  })

  it('rechecks sender restrictions on the locked endpoint before reserving storage', async () => {
    query.mockResolvedValueOnce({
      rows: [{ ...endpoint, allowed_sender_domains: ['trusted.carsales.com.au'] }]
    })

    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'denied',
      code: 'email_endpoint_policy_denied'
    })
    expect(query).toHaveBeenCalledOnce()
  })

  it('rejects a disabled endpoint between policy lookup and stage without inserting', async () => {
    query.mockResolvedValueOnce({ rows: [] })
    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'denied',
      code: 'email_endpoint_unavailable'
    })
    expect(query).toHaveBeenCalledOnce()
  })

  it('denies storage reservation when the client has become analytics-only', async () => {
    query.mockResolvedValueOnce({
      rows: [{ ...endpoint, lead_capture_mode: 'analytics_only' }]
    })

    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'denied',
      code: 'email_endpoint_unavailable'
    })
    expect(query).toHaveBeenCalledOnce()
    expect(query.mock.calls[0]?.[0]).toMatch(/agency_clients/)
  })

  it('durably reserves a provider mismatch so canonical policy can quarantine its evidence', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...endpoint, expected_provider: 'autotrader' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '44444444-4444-4444-8444-444444444444',
        correlation_id: CORRELATION_ID
      }] })

    await expect(reserveEmailIngestionStage(request())).resolves.toMatchObject({
      schemaVersion: 1,
      outcome: 'reserved',
      correlationId: CORRELATION_ID
    })
    expect(query).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['message identity', { message_id_hash: 'd'.repeat(64) }],
    ['provider identity', { provider: 'meta' }],
    ['raw content identity', { raw_content_hash: 'd'.repeat(64) }],
    ['raw content hash version', { raw_content_hash_version: 2 }],
    ['transport identity', { transport: 'postmark' }],
    ['envelope sender identity', { sender_domain: 'other.example' }],
    ['header sender identity', { header_from_domain: 'other.example' }],
    ['raw size identity', { raw_size: 129 }]
  ])('never reuses a live reservation with conflicting %s', async (_label, conflict) => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({
      rows: [liveReservation(conflict)]
    })

    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'denied',
      code: 'email_stage_identity_conflict'
    })
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('scopes the same external identity to different endpoint IDs', async () => {
    const endpointTwo = { ...endpoint, id: '55555555-5555-4555-8555-555555555555', address_token: 'abcdefghjk' }
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '44444444-4444-4444-8444-444444444444',
        correlation_id: CORRELATION_ID
      }] })
      .mockResolvedValueOnce({ rows: [endpointTwo] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '66666666-6666-4666-8666-666666666666',
        correlation_id: '77777777-7777-4777-8777-777777777777'
      }] })

    const first = await reserveEmailIngestionStage(request())
    const second = await reserveEmailIngestionStage({ ...request(), recipientToken: 'abcdefghjk', correlationId: '77777777-7777-4777-8777-777777777777' })

    expect(first.ingestionId).not.toBe(second.ingestionId)
    expect(query.mock.calls[1]?.[1]).toEqual([endpoint.id, HASH, LEGACY_HASH])
    expect(query.mock.calls[4]?.[1]).toEqual([endpointTwo.id, HASH, LEGACY_HASH])
    expect(first.encryptedObjectKey).not.toBe(second.encryptedObjectKey)
  })

  it('resolves a rotated previous token to the same endpoint reservation identity', async () => {
    const rotated = {
      ...endpoint,
      address_token: 'abcdefghjk',
      previous_address_token: '0123456789',
      previous_token_grace_until: '2099-01-01T00:00:00.000Z'
    }
    const existing = liveReservation({
      staged_object_key: 'email-ingestions/same-opaque-reservation'
    })
    query.mockResolvedValueOnce({ rows: [rotated] }).mockResolvedValueOnce({ rows: [existing] })

    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'reserved',
      correlationId: CORRELATION_ID,
      ingestionId: existing.id,
      encryptedObjectKey: existing.staged_object_key
    })
  })

  it.each([
    ['provider ID hash', 'b'.repeat(64)],
    ['deterministic fingerprint fallback', 'c'.repeat(64)]
  ])('uses the endpoint-scoped external hash for %s idempotency', async (_label, externalIdHash) => {
    const retryRow = liveReservation({
      external_id_hash: externalIdHash,
      staged_object_key: ''
    })
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{
        id: '44444444-4444-4444-8444-444444444444',
        correlation_id: CORRELATION_ID
      }] })
      .mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [retryRow] })
    const first = await reserveEmailIngestionStage({ ...request(), externalIdHash })
    retryRow.staged_object_key = first.encryptedObjectKey!
    const retry = await reserveEmailIngestionStage({ ...request(), externalIdHash })

    expect(retry).toEqual(first)
    expect(query.mock.calls[1]?.[1]).toEqual([endpoint.id, externalIdHash, LEGACY_HASH])
    expect(query.mock.calls[4]?.[1]).toEqual([endpoint.id, externalIdHash, LEGACY_HASH])
  })

  it('returns the persisted reservation correlation on a fresh redelivery', async () => {
    const storedCorrelation = '88888888-8888-4888-8888-888888888888'
    const existing = liveReservation({
      correlation_id: storedCorrelation,
      staged_object_key: 'email-ingestions/reused-opaque-reservation'
    })
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [existing] })

    await expect(reserveEmailIngestionStage({
      ...request(),
      correlationId: '99999999-9999-4999-8999-999999999999'
    })).resolves.toEqual({
      schemaVersion: 1,
      outcome: 'reserved',
      correlationId: storedCorrelation,
      ingestionId: existing.id,
      encryptedObjectKey: existing.staged_object_key
    })
    expect(existing.terminal_at).toBeNull()
    expect(query).toHaveBeenCalledTimes(2)
  })

  it.each(['expired previous token', 'disabled endpoint', 'retired endpoint'])(
    'fails closed for an unavailable %s resolution',
    async () => {
      query.mockResolvedValueOnce({ rows: [] })
      await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
        schemaVersion: 1,
        outcome: 'denied',
        code: 'email_endpoint_unavailable'
      })
    }
  )
})
