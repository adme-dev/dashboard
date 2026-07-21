import { describe, expect, it, vi } from 'vitest'
import {
  assessInternalPublication,
  createInternalSendService
} from '../../server/utils/send/internalLifecycle'

const now = new Date('2026-07-21T02:00:00.000Z')

function file(overrides: Record<string, unknown> = {}) {
  return {
    id: 'file-1',
    state: 'quarantined',
    scanStatus: 'not_required',
    uploadMethod: 'multipart',
    intentStatus: 'completed',
    intentExpiresAt: '2026-07-21T02:15:00.000Z',
    expectedSize: 1024,
    actualSize: 1024,
    declaredMimeType: 'application/pdf',
    actualMimeType: 'application/pdf',
    objectEtag: 'etag-1',
    ...overrides
  }
}

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    tenant_id: null,
    client_id: null,
    project_id: null,
    owner_team_member_id: 'member-1',
    status: 'ready',
    version: 3,
    title: 'Internal campaign files',
    message: null,
    max_downloads: 100,
    download_count: 0,
    expected_file_count: 1,
    actual_file_count: 1,
    expected_total_bytes: 1024,
    actual_total_bytes: 1024,
    expires_at: '2026-07-28T00:00:00.000Z',
    published_at: '2026-07-21T01:00:00.000Z',
    created_at: '2026-07-21T00:00:00.000Z',
    updated_at: '2026-07-21T01:00:00.000Z',
    ...overrides
  }
}

describe('private Send publication policy', () => {
  it('rejects publication without a completed file', () => {
    expect(assessInternalPublication([], now)).toEqual({
      ready: false,
      code: 'EMPTY_TRANSFER'
    })
  })

  it('keeps a completed single upload sealed until its write capability expires', () => {
    expect(assessInternalPublication([file({ uploadMethod: 'single' })], now)).toEqual({
      ready: false,
      code: 'UPLOAD_SEALING',
      retryAt: '2026-07-21T02:15:00.000Z'
    })
  })

  it('allows canonically completed multipart files without waiting for intent expiry', () => {
    expect(assessInternalPublication([file()], now)).toEqual({ ready: true })
  })

  it('rejects incomplete or metadata-mismatched files', () => {
    expect(assessInternalPublication([file({ intentStatus: 'uploading' })], now))
      .toEqual({ ready: false, code: 'FILE_INCOMPLETE' })
    expect(assessInternalPublication([file({ actualSize: 512 })], now))
      .toEqual({ ready: false, code: 'OBJECT_MISMATCH' })
    expect(assessInternalPublication([file({ objectEtag: null })], now))
      .toEqual({ ready: false, code: 'OBJECT_MISMATCH' })
  })
})

describe('private Send lifecycle service', () => {
  it('publishes a stable file set without creating a public token or notification', async () => {
    const transfer = {
      id: '44444444-4444-4444-8444-444444444444',
      tenant_id: null,
      client_id: null,
      project_id: null,
      owner_team_member_id: 'member-1',
      status: 'uploading',
      version: 2,
      title: 'Internal campaign files',
      message: null,
      max_downloads: 100,
      download_count: 0,
      expected_file_count: 1,
      actual_file_count: 1,
      expected_total_bytes: 1024,
      actual_total_bytes: 1024,
      expires_at: '2026-07-28T00:00:00.000Z',
      published_at: null,
      created_at: '2026-07-21T00:00:00.000Z',
      updated_at: '2026-07-21T01:00:00.000Z'
    }
    const publicationFile = {
      id: '55555555-5555-4555-8555-555555555555',
      object_key: 'send/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555',
      display_filename: 'campaign.pdf',
      state: 'quarantined',
      scan_status: 'not_required',
      upload_method: 'multipart',
      intent_status: 'completed',
      intent_expires_at: '2026-07-21T02:15:00.000Z',
      expected_size_bytes: 1024,
      actual_size_bytes: 1024,
      declared_mime_type: 'application/pdf',
      actual_mime_type: 'application/pdf',
      object_etag: 'etag-1',
      uploaded_at: '2026-07-21T01:00:00.000Z'
    }
    const statements: string[] = []
    const db = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql)
        if (/FROM send_transfers t[\s\S]*FOR UPDATE/.test(sql)) return { rows: [transfer] }
        if (/FROM send_files f[\s\S]*FOR UPDATE/.test(sql)) return { rows: [publicationFile] }
        if (/UPDATE send_files/.test(sql)) return { rows: [{ id: publicationFile.id }] }
        if (/UPDATE send_transfers/.test(sql)) {
          return { rows: [{ ...transfer, status: 'ready', version: 3, published_at: now.toISOString() }] }
        }
        return { rows: [] }
      })
    }
    const service = createInternalSendService({
      queryOne: vi.fn(async () => transfer) as never,
      queryRows: vi.fn(async () => [publicationFile]) as never,
      transaction: (async callback => callback(db)) as never,
      getObjectMetadata: vi.fn(async key => ({
        key,
        size: 1024,
        contentType: 'application/pdf',
        etag: 'etag-1',
        uploaded: now
      }))
    })

    await expect(service.publish({
      actor: { id: 'member-1', role: 'member' },
      transferId: transfer.id,
      expectedVersion: 2,
      idempotencyKey: 'publish-internal-0001',
      now
    })).resolves.toMatchObject({ status: 'ready', version: 3 })

    expect(statements.some(sql => /state = 'clean'/.test(sql) && /scan_status = 'not_required'/.test(sql))).toBe(true)
    expect(statements.join('\n')).not.toMatch(/share_token|send_recipients|notification/)
  })

  it('never signs a download for an unavailable transfer', async () => {
    const createDownloadUrl = vi.fn()
    const service = createInternalSendService({
      transaction: (async callback => callback({ query: vi.fn(async () => ({ rows: [] })) })) as never,
      createDownloadUrl
    })

    await expect(service.createDownload({
      actor: { id: 'member-2', role: 'member' },
      transferId: '44444444-4444-4444-8444-444444444444',
      fileId: '55555555-5555-4555-8555-555555555555',
      idempotencyKey: 'download-internal-0001',
      now
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(createDownloadUrl).not.toHaveBeenCalled()
  })

  it('issues a one-minute attachment capability after current access checks', async () => {
    const createDownloadUrl = vi.fn(async () => 'https://example.r2.cloudflarestorage.com/signed')
    const row = {
      id: '55555555-5555-4555-8555-555555555555',
      file_id: '55555555-5555-4555-8555-555555555555',
      object_key: 'send/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555',
      display_filename: 'campaign.pdf',
      state: 'clean',
      scan_status: 'not_required',
      status: 'ready',
      max_downloads: 100,
      download_count: 0,
      expires_at: '2026-07-28T00:00:00.000Z'
    }
    let reads = 0
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/JOIN send_files/.test(sql)) return { rows: [row] }
        if (/SELECT 1 FROM send_events/.test(sql)) {
          reads++
          return { rows: [] }
        }
        return { rows: [] }
      })
    }
    const service = createInternalSendService({
      transaction: (async callback => callback(db)) as never,
      createDownloadUrl
    })

    await expect(service.createDownload({
      actor: { id: 'member-2', role: 'member' },
      transferId: '44444444-4444-4444-8444-444444444444',
      fileId: row.file_id,
      idempotencyKey: 'download-internal-0002',
      now
    })).resolves.toEqual({
      url: 'https://example.r2.cloudflarestorage.com/signed',
      expiresAt: '2026-07-21T02:01:00.000Z'
    })
    expect(reads).toBe(1)
    expect(createDownloadUrl).toHaveBeenCalledWith(row.object_key, 60, 'campaign.pdf')
    expect(db.query.mock.calls.some(([sql]) => /download_count = download_count \+ 1/.test(String(sql)))).toBe(true)
  })

  it('extends expiry from the original creation boundary and records an idempotent audit event', async () => {
    const transfer = transferRow()
    const statements: Array<{ sql: string, params?: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        statements.push({ sql, params })
        if (/FROM send_transfers t[\s\S]*FOR UPDATE/.test(sql)) return { rows: [transfer] }
        if (/SELECT 1 FROM send_events/.test(sql)) return { rows: [] }
        if (/UPDATE send_transfers/.test(sql)) {
          return { rows: [{ ...transfer, version: 4, expires_at: '2026-08-20T00:00:00.000Z' }] }
        }
        return { rows: [] }
      })
    }
    const service = createInternalSendService({
      transaction: (async callback => callback(db)) as never
    })

    await expect(service.extendExpiry({
      actor: { id: 'member-1', role: 'member' },
      transferId: transfer.id,
      expiresAt: '2026-08-20T00:00:00.000Z',
      expectedVersion: 3,
      idempotencyKey: 'extend-expiry-000001',
      maxRetentionDays: 30,
      now
    })).resolves.toMatchObject({
      status: 'ready',
      version: 4,
      expiresAt: '2026-08-20T00:00:00.000Z'
    })

    const update = statements.find(({ sql }) => /UPDATE send_transfers/.test(sql))
    expect(update?.params).toEqual([
      transfer.id,
      3,
      '2026-08-20T00:00:00.000Z'
    ])
    expect(statements.some(({ sql, params }) => /'operator_action'/.test(sql)
      && String(params?.[3]).includes('expiry_extended'))).toBe(true)
  })

  it.each([
    ['does not move forward', '2026-07-28T00:00:00.000Z', 'ready', 30],
    ['moves by less than one minute', '2026-07-28T00:00:59.999Z', 'ready', 30],
    ['exceeds the creation policy', '2026-08-21T00:00:00.001Z', 'ready', 30],
    ['is already expired', '2026-08-01T00:00:00.000Z', 'expired', 30],
    ['uses an invalid maximum', '2026-08-01T00:00:00.000Z', 'ready', 0]
  ])('rejects an extension that %s', async (_label, expiresAt, status, maxRetentionDays) => {
    const transfer = transferRow({ status })
    const db = {
      query: vi.fn(async (sql: string) => /FROM send_transfers t/.test(sql)
        ? { rows: [transfer] }
        : { rows: [] })
    }
    const service = createInternalSendService({
      transaction: (async callback => callback(db)) as never
    })

    await expect(service.extendExpiry({
      actor: { id: 'member-1', role: 'member' },
      transferId: transfer.id,
      expiresAt,
      expectedVersion: 3,
      idempotencyKey: 'extend-expiry-000002',
      maxRetentionDays,
      now
    })).rejects.toMatchObject({ code: expect.stringMatching(/NOT_READY|EXPIRED|POLICY_REJECTED/) })
    expect(db.query.mock.calls.some(([sql]) => /UPDATE send_transfers/.test(String(sql)))).toBe(false)
  })

  it('does not reveal or mutate a transfer outside the actor management boundary', async () => {
    const query = vi.fn(async () => ({ rows: [] }))
    const service = createInternalSendService({
      transaction: (async callback => callback({ query })) as never
    })

    await expect(service.extendExpiry({
      actor: { id: 'member-2', role: 'member' },
      transferId: '44444444-4444-4444-8444-444444444444',
      expiresAt: '2026-08-04T00:00:00.000Z',
      expectedVersion: 3,
      idempotencyKey: 'extend-expiry-000003',
      maxRetentionDays: 30,
      now
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(String(query.mock.calls[0]?.[0])).toMatch(/owner_team_member_id[\s\S]*\$3::boolean/)
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('keeps revocation replay idempotent and denies downloads after revocation', async () => {
    const revoked = transferRow({
      status: 'revoked',
      version: 4,
      revoked_at: '2026-07-21T02:00:00.000Z'
    })
    const revokeQuery = vi.fn(async () => ({ rows: [revoked] }))
    const createDownloadUrl = vi.fn()
    const service = createInternalSendService({
      transaction: (async callback => callback({ query: revokeQuery })) as never,
      createDownloadUrl
    })

    await expect(service.revoke({
      actor: { id: 'member-1', role: 'member' },
      transferId: revoked.id,
      expectedVersion: 3,
      idempotencyKey: 'revoke-replay-000001',
      now
    })).resolves.toMatchObject({ status: 'revoked', version: 4 })
    expect(revokeQuery).toHaveBeenCalledTimes(1)

    revokeQuery.mockResolvedValueOnce({
      rows: [{
        ...revoked,
        file_id: '55555555-5555-4555-8555-555555555555',
        object_key: 'send/44444444-4444-4444-8444-444444444444/55555555-5555-4555-8555-555555555555',
        display_filename: 'campaign.pdf',
        state: 'clean',
        scan_status: 'not_required'
      }]
    })
    await expect(service.createDownload({
      actor: { id: 'member-1', role: 'member' },
      transferId: revoked.id,
      fileId: '55555555-5555-4555-8555-555555555555',
      idempotencyKey: 'download-revoked-0001',
      now
    })).rejects.toMatchObject({ code: 'NOT_READY' })
    expect(createDownloadUrl).not.toHaveBeenCalled()
  })
})
