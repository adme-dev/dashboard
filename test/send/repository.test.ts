import { describe, expect, it, vi } from 'vitest'
import {
  createPostgresSendRepository,
  sanitizeSendEventMetadata
} from '../../server/utils/send/repository'

const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    tenant_id: null,
    client_id: '11111111-1111-4111-8111-111111111111',
    project_id: null,
    sender_class: 'workspace',
    owner_team_member_id: 'owner-1',
    public_sender_id: null,
    status: 'ready',
    version: 3,
    title: 'Campaign assets',
    expires_at: new Date('2026-07-28T00:00:00.000Z'),
    created_at: new Date('2026-07-21T00:00:00.000Z'),
    updated_at: new Date('2026-07-21T00:00:00.000Z'),
    ...overrides
  }
}

function repositoryWithDb(handler: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>) {
  const db = { query: vi.fn(handler) }
  const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))
  return {
    db,
    transaction,
    repository: createPostgresSendRepository({ transaction: transaction as never })
  }
}

describe('Send event redaction', () => {
  it('recursively removes secrets and rejects non-JSON metadata', () => {
    const rawBearer = 'a'.repeat(43)
    expect(sanitizeSendEventMetadata({
      safe: 'value',
      detail: rawBearer,
      password: 'secret',
      nested: {
        shareToken: 'raw-token',
        list: [
          { signed_url: 'https://r2/signed', result: 'clean' },
          { location: 'https://r2.example/file?X-Amz-Signature=secret' }
        ]
      }
    })).toEqual({
      safe: 'value',
      detail: '[REDACTED]',
      nested: { list: [{ result: 'clean' }, { location: '[REDACTED]' }] }
    })

    expect(() => sanitizeSendEventMetadata({ invalid: BigInt(1) })).toThrow('JSON-safe')
  })
})

describe('Postgres Send repository', () => {
  const actor = { kind: 'workspace' as const, id: 'owner-1', role: 'member' }

  it('returns only an actor-authorized transfer from the read boundary', async () => {
    const queryOne = vi.fn()
      .mockResolvedValueOnce(transferRow())
      .mockResolvedValueOnce(transferRow())
      .mockResolvedValueOnce(null)
    const repository = createPostgresSendRepository({ queryOne: queryOne as never })

    await expect(repository.getAuthorized(TRANSFER_ID, actor)).resolves.toMatchObject({
      id: TRANSFER_ID,
      clientId: '11111111-1111-4111-8111-111111111111',
      status: 'ready',
      version: 3
    })
    await expect(repository.getAuthorized(TRANSFER_ID, {
      kind: 'workspace',
      id: 'other-user',
      role: 'member'
    })).resolves.toBeNull()
    expect(queryOne).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('send_transfers'),
      [TRANSFER_ID]
    )
    expect(queryOne).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('client_team_assignments'),
      ['11111111-1111-4111-8111-111111111111', 'other-user']
    )
  })

  it('returns a stable conflict without mutating when the expected version is stale', async () => {
    const { db, repository } = repositoryWithDb(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [transferRow()] }
      return { rows: [] }
    })

    await expect(repository.transition({
      transferId: TRANSFER_ID,
      actor,
      expectedVersion: 2,
      nextStatus: 'revoked',
      eventType: 'revoked',
      eventIdempotencyKey: 'event-idempotency-0001',
      metadata: {}
    })).resolves.toEqual({ status: 'version_conflict', currentVersion: 3 })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('updates with optimistic predicates and appends a redacted event in one transaction', async () => {
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const { transaction, repository } = repositoryWithDb(async (sql, params) => {
      queries.push({ sql, params })
      if (/FOR UPDATE/.test(sql)) return { rows: [transferRow()] }
      if (/UPDATE send_transfers/.test(sql)) {
        return { rows: [transferRow({ status: 'revoked', version: 4, revoked_at: new Date() })] }
      }
      return { rows: [] }
    })

    const result = await repository.transition({
      transferId: TRANSFER_ID,
      actor,
      expectedVersion: 3,
      nextStatus: 'revoked',
      eventType: 'revoked',
      eventIdempotencyKey: 'event-idempotency-0001',
      metadata: { reason: 'sender request', nested: { managementToken: 'raw-secret' } }
    })

    expect(result).toMatchObject({ status: 'updated', transfer: { status: 'revoked', version: 4 } })
    expect(transaction).toHaveBeenCalledOnce()
    expect(queries.map(query => query.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE/),
      expect.stringMatching(/UPDATE send_transfers/),
      expect.stringMatching(/INSERT INTO send_events/)
    ])
    expect(queries[1]!.sql).toMatch(/WHERE id = \$1[\s\S]*version = \$3[\s\S]*status = \$4/)
    expect(JSON.parse(queries[2]!.params[6] as string)).toEqual({ reason: 'sender request', nested: {} })
  })

  it('fails closed for an unassigned cross-client actor before any mutation', async () => {
    const { db, repository } = repositoryWithDb(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [transferRow()] }
      if (/client_team_assignments/.test(sql)) return { rows: [] }
      return { rows: [] }
    })

    await expect(repository.transition({
      transferId: TRANSFER_ID,
      actor: { kind: 'workspace', id: 'other-user', role: 'member' },
      expectedVersion: 3,
      nextStatus: 'revoked',
      eventType: 'revoked',
      eventIdempotencyKey: 'event-idempotency-0002',
      metadata: {}
    })).resolves.toEqual({ status: 'not_found' })
    expect(db.query).toHaveBeenCalledTimes(2)
    expect(db.query.mock.calls.some(([sql]) => /UPDATE send_transfers|INSERT INTO/.test(String(sql)))).toBe(false)
  })

  it('rejects invalid lifecycle regression before any write', async () => {
    const { db, repository } = repositoryWithDb(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [transferRow()] }
      return { rows: [] }
    })

    await expect(repository.transition({
      transferId: TRANSFER_ID,
      actor,
      expectedVersion: 3,
      nextStatus: 'uploading',
      eventType: 'upload_completed',
      eventIdempotencyKey: 'event-idempotency-0003',
      metadata: {}
    })).resolves.toEqual({ status: 'invalid_transition', currentStatus: 'ready' })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('rejects an audit event that does not describe the requested transition', async () => {
    const { db, repository } = repositoryWithDb(async (sql) => {
      if (/FOR UPDATE/.test(sql)) return { rows: [transferRow()] }
      return { rows: [] }
    })

    await expect(repository.transition({
      transferId: TRANSFER_ID,
      actor,
      expectedVersion: 3,
      nextStatus: 'revoked',
      eventType: 'published',
      eventIdempotencyKey: 'event-idempotency-0004',
      metadata: {}
    })).resolves.toEqual({ status: 'invalid_event', nextStatus: 'revoked' })
    expect(db.query).toHaveBeenCalledOnce()
  })
})
