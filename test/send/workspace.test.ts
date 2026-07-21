import { describe, expect, it, vi } from 'vitest'
import type { WorkspaceSendError } from '../../server/utils/send/workspace'
import { createWorkspaceSendService } from '../../server/utils/send/workspace'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'

const policy = {
  surface: 'workspace' as const,
  maxTransferBytes: 2 * 1024 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  maxFiles: 20,
  defaultRetentionDays: 7,
  maxRetentionDays: 30,
  maxRecipients: 20,
  maxDownloads: 100,
  scanRequired: false
}

const draft = {
  title: 'Campaign assets',
  message: 'For launch',
  expiresAt: '2026-07-28T00:00:00.000Z',
  maxDownloads: 5,
  idempotencyKey: 'create-send-draft-0001',
  clientId: CLIENT_ID,
  projectId: PROJECT_ID
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    tenant_id: null,
    client_id: CLIENT_ID,
    project_id: PROJECT_ID,
    sender_class: 'workspace',
    owner_team_member_id: 'member-1',
    public_sender_id: null,
    status: 'draft',
    version: 1,
    title: 'Campaign assets',
    message: 'For launch',
    access_mode: 'link',
    max_downloads: 5,
    expected_file_count: 0,
    expected_total_bytes: 0,
    recipient_count: 0,
    expires_at: new Date('2026-07-28T00:00:00.000Z'),
    created_at: new Date('2026-07-21T00:00:00.000Z'),
    updated_at: new Date('2026-07-21T00:00:00.000Z'),
    ...overrides
  }
}

describe('workspace Send service', () => {
  const actor = { id: 'member-1', role: 'member' }

  it('creates an idempotent draft only after client and project authorization', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/creation_idempotency_key/.test(sql) && /SELECT/.test(sql)) return { rows: [] }
        if (/client_team_assignments/.test(sql)) return { rows: [{ exists: 1 }] }
        if (/FROM projects/.test(sql)) return { rows: [{ exists: 1 }] }
        if (/INSERT INTO send_transfers/.test(sql)) return { rows: [row()] }
        return { rows: [] }
      })
    }
    const transaction = vi.fn(async callback => callback(db))
    const service = createWorkspaceSendService({ transaction: transaction as never })

    await expect(service.createDraft({
      actor,
      draft,
      policy,
      now: new Date('2026-07-21T00:00:00.000Z')
    })).resolves.toMatchObject({ id: TRANSFER_ID, status: 'draft', recipientCount: 0 })

    expect(statements.map(item => item.sql)).toEqual([
      expect.stringMatching(/creation_idempotency_key/),
      expect.stringMatching(/client_team_assignments/),
      expect.stringMatching(/FROM projects/),
      expect.stringMatching(/INSERT INTO send_transfers/),
      expect.stringMatching(/INSERT INTO send_events/)
    ])
    const transferInsert = statements.find(item => /INSERT INTO send_transfers/.test(item.sql))!
    expect(transferInsert.sql).toContain('share_token_hash')
    expect(transferInsert.params).toContain(null)
    expect(JSON.stringify(statements)).not.toContain(draft.idempotencyKey)
  })

  it('denies an unassigned member before checking a project or writing', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/creation_idempotency_key/.test(sql) && /SELECT/.test(sql)) return { rows: [] }
        if (/client_team_assignments/.test(sql)) return { rows: [] }
        return { rows: [] }
      })
    }
    const service = createWorkspaceSendService({
      transaction: (async callback => callback(db)) as never
    })

    await expect(service.createDraft({
      actor,
      draft,
      policy,
      now: new Date('2026-07-21T00:00:00.000Z')
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendError>>({ code: 'CLIENT_ACCESS_DENIED' }))
    expect(db.query.mock.calls.some(([sql]) => /FROM projects|INSERT INTO/.test(String(sql)))).toBe(false)
  })

  it('returns the winning draft when concurrent idempotent inserts race', async () => {
    let idempotencyReads = 0
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/creation_idempotency_key/.test(sql) && /SELECT/.test(sql)) {
          idempotencyReads++
          return { rows: idempotencyReads === 1 ? [] : [row({ client_id: null, project_id: null })] }
        }
        if (/INSERT INTO send_transfers/.test(sql)) return { rows: [] }
        return { rows: [] }
      })
    }
    const service = createWorkspaceSendService({
      transaction: (async callback => callback(db)) as never
    })

    await expect(service.createDraft({
      actor,
      draft: { ...draft, clientId: undefined, projectId: undefined },
      policy,
      now: new Date('2026-07-21T00:00:00.000Z')
    })).resolves.toMatchObject({ id: TRANSFER_ID })
    expect(db.query.mock.calls.some(([sql]) => /INSERT INTO send_recipients|INSERT INTO send_events/.test(String(sql)))).toBe(false)
  })

  it('rejects invalid expiry before opening a transaction', async () => {
    const transaction = vi.fn()
    const service = createWorkspaceSendService({ transaction: transaction as never })

    await expect(service.createDraft({
      actor,
      draft: { ...draft, expiresAt: '2026-07-20T00:00:00.000Z' },
      policy,
      now: new Date('2026-07-21T00:00:00.000Z')
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendError>>({ code: 'POLICY_REJECTED' }))
    expect(transaction).not.toHaveBeenCalled()
  })

  it('lists internal unscoped transfers plus owner, management, or assigned-client rows', async () => {
    const queryRows = vi.fn(async () => [row(), row({ id: '55555555-5555-4555-8555-555555555555' })])
    const service = createWorkspaceSendService({ queryRows: queryRows as never })

    await expect(service.list({ actor, status: 'draft', page: 2, pageSize: 1 })).resolves.toMatchObject({
      page: 2,
      pageSize: 1,
      hasMore: true,
      transfers: [{ id: TRANSFER_ID }]
    })

    const [sql, params] = queryRows.mock.calls[0]!
    expect(sql).toMatch(/owner_team_member_id = \$1[\s\S]*client_id IS NULL[\s\S]*client_team_assignments/)
    expect(sql).toMatch(/status = \$3/)
    expect(params).toEqual(['member-1', false, 'draft', 2, 1])
  })
})
