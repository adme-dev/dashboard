import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, transaction } = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn()
}))

transaction.mockImplementation(async (callback: (db: { query: typeof query }) => Promise<unknown>) => callback({ query }))

vi.mock('~~/server/utils/db', () => ({ queryOne: vi.fn(), transaction }))
import { reserveEmailIngestionStage } from '../../../../server/utils/leads/emailIngestion'

const HASH = 'a'.repeat(64)
const endpoint = {
  id: '11111111-1111-4111-8111-111111111111', client_id: '22222222-2222-4222-8222-222222222222',
  form_id: 'email_endpoint:11111111-1111-4111-8111-111111111111', form_name: 'Carsales', enabled: true, retired_at: null,
  address_token: '0123456789', previous_address_token: null, previous_token_grace_until: null,
  expected_provider: 'carsales', parser_mode: 'auto', ai_extraction_mode: 'disabled', allowed_sender_domains: []
}

function request() {
  return {
    schemaVersion: 1 as const, correlationId: '33333333-3333-4333-8333-333333333333',
    transport: 'cloudflare_email_routing' as const, recipientToken: '0123456789', externalIdHash: HASH,
    messageIdHash: HASH, provider: 'carsales', receivedAt: '2026-07-29T00:00:00.000Z', rawSize: 128,
    safeEvidence: { hasText: true, hasHtml: false, hasAdf: false, fieldKeys: ['full_name'] },
    quarantineExpiresAt: '2099-08-05T00:00:00.000Z'
  }
}

describe('email stage reservation', () => {
  beforeEach(() => { query.mockReset(); transaction.mockClear() })

  it('issues a random opaque key only for a non-terminal endpoint-scoped reservation', async () => {
    await expect(reserveEmailIngestionStage({} as never)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('persists only safe hashes and reuses a non-terminal reservation key on retry', async () => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '44444444-4444-4444-8444-444444444444' }] })
    const first = await reserveEmailIngestionStage(request())
    expect(first).toMatchObject({ outcome: 'reserved', ingestionId: '44444444-4444-4444-8444-444444444444' })
    expect(first.encryptedObjectKey).toMatch(/^email-ingestions\/[A-Za-z0-9_-]{16,}$/)
    expect(JSON.stringify(query.mock.calls[2]?.[1])).not.toContain('Jane Example')

    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [{
      id: first.ingestionId, terminal_at: null, staged_object_key: first.encryptedObjectKey
    }] })
    await expect(reserveEmailIngestionStage(request())).resolves.toEqual(first)
  })

  it('returns a terminal duplicate without issuing another raw-object key', async () => {
    query.mockResolvedValueOnce({ rows: [endpoint] }).mockResolvedValueOnce({ rows: [{
      id: '44444444-4444-4444-8444-444444444444', terminal_at: '2026-07-29T01:00:00.000Z', staged_object_key: 'email-ingestions/previous-reservation-key'
    }] })
    await expect(reserveEmailIngestionStage(request())).resolves.toEqual({
      schemaVersion: 1, outcome: 'duplicate', ingestionId: '44444444-4444-4444-8444-444444444444', encryptedObjectKey: null
    })
  })
})
