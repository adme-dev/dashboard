import { describe, expect, it, vi } from 'vitest'
import type { PublicSendError } from '../../server/utils/send/publicSender'
import { createPublicSendService } from '../../server/utils/send/publicSender'

const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'
const SENDER_ID = '55555555-5555-4555-8555-555555555555'
const CHALLENGE_ID = '66666666-6666-4666-8666-666666666666'
const NOW = new Date('2026-07-21T00:00:00.000Z')

const policy = {
  surface: 'public' as const,
  maxTransferBytes: 250 * 1024 * 1024,
  maxFileBytes: 100 * 1024 * 1024,
  maxFiles: 10,
  defaultRetentionDays: 3,
  maxRetentionDays: 3,
  maxRecipients: 0,
  maxDownloads: 20,
  scanRequired: true
}

const draft = {
  title: 'Launch files',
  message: 'Shared safely',
  recipients: [],
  expiresAt: '2026-07-24T00:00:00.000Z',
  maxDownloads: 10,
  idempotencyKey: 'public-send-draft-0001'
}

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    public_sender_id: SENDER_ID,
    status: 'awaiting_verification',
    version: 1,
    expires_at: new Date('2026-07-24T00:00:00.000Z'),
    ...overrides
  }
}

describe('verified public Send service', () => {
  it('creates a transfer-scoped verification challenge without exposing raw tokens to persistence', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM send_public_senders/.test(sql) && /FOR UPDATE/.test(sql)) return { rows: [] }
        if (/INSERT INTO send_public_senders/.test(sql)) return { rows: [{ id: SENDER_ID }] }
        if (/creation_idempotency_key/.test(sql) && /SELECT/.test(sql)) return { rows: [] }
        if (/INSERT INTO send_transfers/.test(sql)) return { rows: [transferRow()] }
        if (/INSERT INTO send_public_verifications/.test(sql)) return { rows: [{ id: CHALLENGE_ID }] }
        return { rows: [] }
      })
    }
    const sendVerification = vi.fn().mockResolvedValue(undefined)
    const tokens = [
      { raw: 'v'.repeat(43), hash: 'a'.repeat(64) },
      { raw: 'm'.repeat(43), hash: 'b'.repeat(64) }
    ]
    const service = createPublicSendService({
      transaction: (async callback => callback(db)) as never,
      createToken: vi.fn(() => tokens.shift()!) as never,
      sendVerification
    })

    await expect(service.createDraft({
      email: ' Sender@Example.com ',
      draft,
      policy,
      now: NOW
    })).resolves.toEqual({
      transferId: TRANSFER_ID,
      status: 'awaiting_verification',
      verificationExpiresAt: '2026-07-21T00:15:00.000Z'
    })

    expect(sendVerification).toHaveBeenCalledWith({
      email: 'sender@example.com',
      transferId: TRANSFER_ID,
      verificationToken: 'v'.repeat(43),
      managementToken: 'm'.repeat(43),
      verificationExpiresAt: '2026-07-21T00:15:00.000Z'
    })
    expect(JSON.stringify(statements)).not.toContain('v'.repeat(43))
    expect(JSON.stringify(statements)).not.toContain('m'.repeat(43))
    expect(JSON.stringify(statements)).not.toContain('public-send-draft-0001')
    expect(statements.find(item => /INSERT INTO send_transfers/.test(item.sql))?.params)
      .toEqual(expect.arrayContaining(['b'.repeat(64)]))
    expect(statements.find(item => /INSERT INTO send_public_verifications/.test(item.sql))?.params)
      .toEqual(expect.arrayContaining(['a'.repeat(64)]))
  })

  it('rejects blocked senders before creating a transfer or sending email', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_public_senders/.test(sql)) {
          return { rows: [{ id: SENDER_ID, verification_status: 'blocked', abuse_status: 'blocked' }] }
        }
        return { rows: [] }
      })
    }
    const sendVerification = vi.fn()
    const service = createPublicSendService({
      transaction: (async callback => callback(db)) as never,
      sendVerification
    })

    await expect(service.createDraft({
      email: 'sender@example.com', draft, policy, now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<PublicSendError>>({ code: 'SENDER_UNAVAILABLE' }))
    expect(db.query.mock.calls.some(([sql]) => /INSERT INTO send_transfers/.test(String(sql)))).toBe(false)
    expect(sendVerification).not.toHaveBeenCalled()
  })

  it('consumes a transfer-scoped challenge exactly once and verifies management possession', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_public_verifications/.test(sql) && /FOR UPDATE/.test(sql)) {
          return {
            rows: [{
              id: CHALLENGE_ID,
              transfer_id: TRANSFER_ID,
              public_sender_id: SENDER_ID,
              token_hash: 'a'.repeat(64),
              management_token_hash: 'b'.repeat(64),
              verification_expires_at: new Date('2026-07-21T00:15:00.000Z'),
              verification_consumed_at: null,
              transfer_status: 'awaiting_verification'
            }]
          }
        }
        if (/UPDATE send_transfers/.test(sql)) return { rows: [transferRow({ status: 'uploading', version: 2 })] }
        return { rows: [] }
      })
    }
    const service = createPublicSendService({
      transaction: (async callback => callback(db)) as never,
      hashToken: vi.fn((value: string) => value.startsWith('verify') ? 'a'.repeat(64) : 'b'.repeat(64))
    })

    await expect(service.verifySender({
      transferId: TRANSFER_ID,
      verificationToken: 'verify-token',
      managementToken: 'manage-token',
      now: NOW
    })).resolves.toEqual({
      transferId: TRANSFER_ID,
      publicSenderId: SENDER_ID,
      status: 'uploading',
      managementToken: 'manage-token'
    })

    expect(db.query.mock.calls.some(([sql]) => /verification_consumed_at =/.test(String(sql)))).toBe(true)
    expect(db.query.mock.calls.some(([sql]) => /event_type/.test(String(sql)) && /sender_verified/.test(String(sql)))).toBe(true)
  })

  it.each([
    ['expired', { verification_expires_at: new Date('2026-07-20T23:59:59.000Z') }, 'VERIFICATION_EXPIRED'],
    ['replayed', { verification_consumed_at: new Date('2026-07-21T00:00:00.000Z') }, 'VERIFICATION_USED'],
    ['wrong transfer state', { transfer_status: 'uploading' }, 'VERIFICATION_UNAVAILABLE']
  ])('rejects %s verification challenges', async (_label, overrides, code) => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_public_verifications/.test(sql)) {
          return {
            rows: [{
              id: CHALLENGE_ID,
              transfer_id: TRANSFER_ID,
              public_sender_id: SENDER_ID,
              token_hash: 'a'.repeat(64),
              management_token_hash: 'b'.repeat(64),
              verification_expires_at: new Date('2026-07-21T00:15:00.000Z'),
              verification_consumed_at: null,
              transfer_status: 'awaiting_verification',
              ...overrides
            }]
          }
        }
        return { rows: [] }
      })
    }
    const service = createPublicSendService({
      transaction: (async callback => callback(db)) as never,
      hashToken: vi.fn((value: string) => value.startsWith('verify') ? 'a'.repeat(64) : 'b'.repeat(64))
    })

    await expect(service.verifySender({
      transferId: TRANSFER_ID,
      verificationToken: 'verify-token',
      managementToken: 'manage-token',
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<PublicSendError>>({ code }))
  })
})
