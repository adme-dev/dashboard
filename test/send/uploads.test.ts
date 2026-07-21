import { describe, expect, it, vi } from 'vitest'
import {
  WorkspaceUploadCompleteSchema,
  WorkspaceUploadIntentRequestSchema,
  WorkspaceUploadMultipartPartSchema,
  WorkspaceUploadMultipartResumeSchema
} from '../../shared/types/send'
import {
  createWorkspaceSendUploadService,
  type WorkspaceSendUploadError
} from '../../server/utils/send/uploads'

const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'
const FILE_ID = '55555555-5555-4555-8555-555555555555'
const INTENT_ID = '66666666-6666-4666-8666-666666666666'
const ACTOR = { id: 'member-1', role: 'member' }
const NOW = new Date('2026-07-21T00:00:00.000Z')
const EXPIRES_AT = new Date('2026-07-21T00:15:00.000Z')
const CAPABILITY = 'c'.repeat(43)
const CAPABILITY_HASH = 'a'.repeat(64)

const declaration = {
  fileName: 'launch-plan.pdf',
  fileSize: 2048,
  contentType: 'application/pdf',
  idempotencyKey: 'upload-launch-plan-0001'
}

function transferRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    status: 'draft',
    configured_max_bytes: 10_000,
    configured_max_files: 5,
    expected_total_bytes: 0,
    expected_file_count: 0,
    expires_at: new Date('2026-07-28T00:00:00.000Z'),
    policy_snapshot: { maxFileBytes: 5_000 },
    ...overrides
  }
}

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT_ID,
    transfer_id: TRANSFER_ID,
    file_id: FILE_ID,
    uploader_id: ACTOR.id,
    object_key: `send/${TRANSFER_ID}/${FILE_ID}`,
    expected_size_bytes: 2048,
    expected_mime_type: 'application/pdf',
    original_filename: 'launch-plan.pdf',
    display_filename: 'launch-plan.pdf',
    upload_method: 'single',
    multipart_upload_id: null,
    multipart_part_size_bytes: null,
    status: 'pending',
    file_state: 'uploading',
    capability_nonce_hash: CAPABILITY_HASH,
    expires_at: EXPIRES_AT,
    completed_at: null,
    actual_size_bytes: null,
    actual_mime_type: null,
    object_etag: null,
    uploaded_at: null,
    ...overrides
  }
}

describe('workspace Send upload contracts', () => {
  it('accepts declarations without accepting a caller-selected object key', () => {
    expect(WorkspaceUploadIntentRequestSchema.parse(declaration)).toEqual(declaration)
    expect(() => WorkspaceUploadIntentRequestSchema.parse({
      ...declaration,
      objectKey: `send/${TRANSFER_ID}/attacker-choice`
    })).toThrow()
  })

  it('requires an opaque completion capability and rejects unknown fields', () => {
    expect(WorkspaceUploadCompleteSchema.parse({ capability: CAPABILITY })).toEqual({ capability: CAPABILITY })
    expect(() => WorkspaceUploadCompleteSchema.parse({ capability: CAPABILITY, objectKey: 'substitute' })).toThrow()
  })

  it('accepts only server-scoped multipart part and resume capabilities', () => {
    expect(WorkspaceUploadMultipartPartSchema.parse({
      capability: CAPABILITY,
      partNumber: 3
    })).toEqual({ capability: CAPABILITY, partNumber: 3 })
    expect(WorkspaceUploadMultipartResumeSchema.parse({ capability: CAPABILITY }))
      .toEqual({ capability: CAPABILITY })
    expect(() => WorkspaceUploadMultipartPartSchema.parse({
      capability: CAPABILITY,
      partNumber: 3,
      uploadId: 'caller-selected',
      objectKey: 'send/substitute'
    })).toThrow()
    expect(() => WorkspaceUploadMultipartPartSchema.parse({
      capability: CAPABILITY,
      partNumber: 10_001
    })).toThrow()
  })
})

describe('workspace Send upload service', () => {
  it('creates a server-keyed, policy-bound intent and advances a draft to uploading', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM send_transfers t/.test(sql)) return { rows: [transferRow()] }
        if (/FROM send_upload_intents i/.test(sql)) return { rows: [] }
        if (/INSERT INTO send_files/.test(sql)) return { rows: [{ id: FILE_ID }] }
        if (/INSERT INTO send_upload_intents/.test(sql)) return { rows: [intentRow()] }
        return { rows: [] }
      })
    }
    const service = createWorkspaceSendUploadService({
      transaction: (async callback => callback(db)) as never,
      createId: vi.fn()
        .mockReturnValueOnce(FILE_ID)
        .mockReturnValueOnce(INTENT_ID),
      createCapability: vi.fn(() => CAPABILITY),
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      createUploadUrl: vi.fn(async () => 'https://example.r2.cloudflarestorage.com/signed')
    })

    const result = await service.createIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      declaration,
      ttlSeconds: 900,
      now: NOW
    })

    expect(result).toMatchObject({
      fileId: FILE_ID,
      intentId: INTENT_ID,
      uploadUrl: 'https://example.r2.cloudflarestorage.com/signed',
      capability: CAPABILITY,
      requiredHeaders: { 'Content-Type': 'application/pdf' },
      expiresAt: EXPIRES_AT.toISOString()
    })
    const fileInsert = statements.find(statement => /INSERT INTO send_files/.test(statement.sql))!
    expect(fileInsert.params).toContain(`send/${TRANSFER_ID}/${FILE_ID}`)
    expect(JSON.stringify(statements)).not.toContain('example.r2.cloudflarestorage.com')
    expect(statements.some(statement => /status = CASE WHEN status = 'draft' THEN 'uploading'/.test(statement.sql))).toBe(true)
  })

  it.each([
    ['file byte limit', { policy_snapshot: { maxFileBytes: 1024 } }],
    ['transfer byte limit', { configured_max_bytes: 1024 }],
    ['file count limit', { configured_max_files: 0 }],
    ['expired transfer', { expires_at: new Date('2026-07-20T00:00:00.000Z') }]
  ])('rejects policy violations: %s', async (_label, overrides) => {
    const db = {
      query: vi.fn(async (sql: string) => ({
        rows: /FROM send_transfers t/.test(sql) ? [transferRow(overrides)] : []
      }))
    }
    const createUploadUrl = vi.fn()
    const service = createWorkspaceSendUploadService({
      transaction: (async callback => callback(db)) as never,
      createUploadUrl
    })

    await expect(service.createIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      declaration,
      ttlSeconds: 900,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({ code: 'POLICY_REJECTED' }))
    expect(createUploadUrl).not.toHaveBeenCalled()
  })

  it('confirms only the canonical object with exact size and content type, once', async () => {
    let completionRead = 0
    const queryOne = vi.fn(async () => intentRow())
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_upload_intents i/.test(sql)) {
          completionRead++
          return { rows: [intentRow(completionRead > 1 ? { status: 'completed', completed_at: NOW } : {})] }
        }
        if (/UPDATE send_files/.test(sql)) return { rows: [intentRow({
          status: 'completed',
          file_state: 'quarantined',
          completed_at: NOW,
          actual_size_bytes: 2048,
          actual_mime_type: 'application/pdf',
          object_etag: 'etag-1',
          uploaded_at: NOW
        })] }
        return { rows: [] }
      })
    }
    const service = createWorkspaceSendUploadService({
      queryOne: queryOne as never,
      transaction: (async callback => callback(db)) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      getObjectMetadata: vi.fn(async key => ({
        key,
        size: 2048,
        contentType: 'application/pdf',
        etag: 'etag-1',
        uploaded: NOW
      }))
    })

    await expect(service.completeIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).resolves.toMatchObject({ state: 'quarantined', size: 2048, contentType: 'application/pdf' })

    expect(db.query.mock.calls.filter(([sql]) => /actual_file_count = actual_file_count \+ 1/.test(String(sql)))).toHaveLength(1)
    expect(db.query.mock.calls).toContainEqual([
      expect.stringMatching(/INSERT INTO send_scan_jobs/),
      [TRANSFER_ID, FILE_ID, `send/${TRANSFER_ID}/${FILE_ID}`, 2048, 'application/pdf', 'etag-1', 'single', EXPIRES_AT.toISOString()]
    ])
  })

  it.each([
    ['wrong size', { size: 2049, contentType: 'application/pdf' }],
    ['wrong content type', { size: 2048, contentType: 'text/plain' }]
  ])('rejects canonical object metadata mismatch: %s', async (_label, metadata) => {
    const transaction = vi.fn()
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => intentRow()) as never,
      transaction: transaction as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      getObjectMetadata: vi.fn(async key => ({ key, etag: 'etag-1', uploaded: NOW, ...metadata }))
    })

    await expect(service.completeIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({ code: 'OBJECT_MISMATCH' }))
    expect(transaction).not.toHaveBeenCalled()
  })

  it.each([
    ['substituted capability', 'b'.repeat(64), EXPIRES_AT, 'CAPABILITY_INVALID'],
    ['expired intent', CAPABILITY_HASH, new Date('2026-07-20T00:00:00.000Z'), 'INTENT_EXPIRED']
  ])('rejects %s before reading R2', async (_label, capabilityHash, expiresAt, code) => {
    const getObjectMetadata = vi.fn()
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => intentRow({ capability_nonce_hash: capabilityHash, expires_at: expiresAt })) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      getObjectMetadata
    })

    await expect(service.completeIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({ code }))
    expect(getObjectMetadata).not.toHaveBeenCalled()
  })

  it('returns not found for cross-tenant or cross-owner intent access', async () => {
    const service = createWorkspaceSendUploadService({ queryOne: vi.fn(async () => null) as never })
    await expect(service.completeIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({ code: 'NOT_FOUND' }))
  })

  it('aborts an active intent once and releases its declared policy budget', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_upload_intents i/.test(sql)) return { rows: [intentRow()] }
        return { rows: [] }
      })
    }
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => intentRow()) as never,
      transaction: (async callback => callback(db)) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH)
    })

    await expect(service.abortIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).resolves.toEqual({ aborted: true })

    expect(db.query.mock.calls.some(([sql]) => /state = 'aborted'/.test(String(sql)))).toBe(true)
    expect(db.query.mock.calls.some(([sql]) => /expected_file_count = GREATEST\(0, expected_file_count - 1\)/.test(String(sql)))).toBe(true)
  })
})
