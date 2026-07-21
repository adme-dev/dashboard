import { describe, expect, it, vi } from 'vitest'
import {
  createWorkspaceSendUploadService,
  type WorkspaceSendUploadError
} from '../../server/utils/send/uploads'

const MiB = 1024 * 1024
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'
const FILE_ID = '55555555-5555-4555-8555-555555555555'
const INTENT_ID = '66666666-6666-4666-8666-666666666666'
const ACTOR = { id: 'member-1', role: 'member' }
const NOW = new Date('2026-07-21T00:00:00.000Z')
const EXPIRES_AT = new Date('2026-07-21T00:15:00.000Z')
const CAPABILITY = 'c'.repeat(43)
const CAPABILITY_HASH = 'a'.repeat(64)
const UPLOAD_ID = 'server-only-r2-upload-id'

const declaration = {
  fileName: 'campaign-master.mov',
  fileSize: 41 * MiB,
  contentType: 'video/quicktime',
  idempotencyKey: 'upload-campaign-master-0001'
}

function transferRow() {
  return {
    id: TRANSFER_ID,
    status: 'draft',
    configured_max_bytes: 100 * MiB,
    configured_max_files: 5,
    expected_total_bytes: 0,
    expected_file_count: 0,
    expires_at: new Date('2026-07-28T00:00:00.000Z'),
    policy_snapshot: { maxFileBytes: 100 * MiB }
  }
}

function multipartIntentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INTENT_ID,
    transfer_id: TRANSFER_ID,
    file_id: FILE_ID,
    uploader_id: ACTOR.id,
    object_key: `send/${TRANSFER_ID}/${FILE_ID}`,
    expected_size_bytes: declaration.fileSize,
    expected_mime_type: declaration.contentType,
    original_filename: declaration.fileName,
    display_filename: declaration.fileName,
    upload_method: 'multipart',
    multipart_upload_id: UPLOAD_ID,
    multipart_part_size_bytes: 16 * MiB,
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

describe('workspace Send multipart service', () => {
  it('creates a server-owned multipart identity above the configured threshold', async () => {
    const statements: Array<{ sql: string, params: unknown[] }> = []
    const db = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        statements.push({ sql, params })
        if (/FROM send_transfers t/.test(sql)) return { rows: [transferRow()] }
        if (/FROM send_upload_intents i/.test(sql)) return { rows: [] }
        if (/INSERT INTO send_files/.test(sql)) return { rows: [{ id: FILE_ID }] }
        if (/INSERT INTO send_upload_intents/.test(sql)) return { rows: [{ id: INTENT_ID }] }
        return { rows: [] }
      })
    }
    const createMultipartUpload = vi.fn(async () => UPLOAD_ID)
    const createUploadUrl = vi.fn()
    const service = createWorkspaceSendUploadService({
      transaction: (async callback => callback(db)) as never,
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      createId: vi.fn().mockReturnValueOnce(FILE_ID).mockReturnValueOnce(INTENT_ID),
      createCapability: vi.fn(() => CAPABILITY),
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      createUploadUrl,
      createMultipartUpload
    })

    const response = await service.createIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      declaration,
      ttlSeconds: 900,
      multipart: { thresholdBytes: 32 * MiB, partSizeBytes: 16 * MiB },
      now: NOW
    })

    expect(response).toEqual({
      uploadMethod: 'multipart',
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      partSizeBytes: 16 * MiB,
      partCount: 3,
      expiresAt: EXPIRES_AT.toISOString()
    })
    expect(createMultipartUpload).toHaveBeenCalledWith(
      `send/${TRANSFER_ID}/${FILE_ID}`,
      declaration.contentType
    )
    expect(createUploadUrl).not.toHaveBeenCalled()
    expect(JSON.stringify(response)).not.toContain(UPLOAD_ID)
    expect(statements.find(statement => /INSERT INTO send_files/.test(statement.sql))?.params)
      .toContain('multipart')
  })

  it('reissues a pending multipart intent without creating another R2 upload', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_transfers t/.test(sql)) return { rows: [transferRow()] }
        if (/FROM send_upload_intents i/.test(sql)) return { rows: [multipartIntentRow()] }
        return { rows: [] }
      })
    }
    const createMultipartUpload = vi.fn()
    const service = createWorkspaceSendUploadService({
      transaction: (async callback => callback(db)) as never,
      createCapability: vi.fn(() => CAPABILITY),
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      createMultipartUpload
    })

    await expect(service.createIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      declaration,
      ttlSeconds: 900,
      multipart: { thresholdBytes: 32 * MiB, partSizeBytes: 16 * MiB },
      now: NOW
    })).resolves.toMatchObject({
      uploadMethod: 'multipart',
      fileId: FILE_ID,
      intentId: INTENT_ID,
      partSizeBytes: 16 * MiB,
      partCount: 3
    })
    expect(createMultipartUpload).not.toHaveBeenCalled()
  })

  it('returns only server-validated completed parts for resume', async () => {
    const listMultipartParts = vi.fn(async () => [
      { partNumber: 1, sizeBytes: 16 * MiB, etag: 'etag-1' },
      { partNumber: 2, sizeBytes: 16 * MiB, etag: 'etag-2' }
    ])
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      listMultipartParts
    })

    await expect(service.resumeMultipartIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).resolves.toEqual({
      partSizeBytes: 16 * MiB,
      partCount: 3,
      uploadedParts: [
        { partNumber: 1, sizeBytes: 16 * MiB },
        { partNumber: 2, sizeBytes: 16 * MiB }
      ],
      expiresAt: EXPIRES_AT.toISOString()
    })
  })

  it.each([
    ['duplicate part', [
      { partNumber: 1, sizeBytes: 16 * MiB, etag: 'etag-1' },
      { partNumber: 1, sizeBytes: 16 * MiB, etag: 'etag-1b' }
    ]],
    ['invalid non-final size', [
      { partNumber: 1, sizeBytes: 15 * MiB, etag: 'etag-1' }
    ]],
    ['part outside geometry', [
      { partNumber: 4, sizeBytes: 1, etag: 'etag-4' }
    ]]
  ])('rejects invalid canonical resume state: %s', async (_label, parts) => {
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      listMultipartParts: vi.fn(async () => parts)
    })

    await expect(service.resumeMultipartIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({
      code: 'MULTIPART_MISMATCH'
    }))
  })

  it('signs only a part inside the persisted geometry', async () => {
    const createMultipartPartUrl = vi.fn(async () => 'https://r2.example/part')
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      createMultipartPartUrl
    })

    await expect(service.createMultipartPartIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      partNumber: 3,
      ttlSeconds: 300,
      now: NOW
    })).resolves.toEqual({
      partNumber: 3,
      uploadUrl: 'https://r2.example/part',
      expiresAt: new Date('2026-07-21T00:05:00.000Z').toISOString()
    })
    expect(createMultipartPartUrl).toHaveBeenCalledWith({
      key: `send/${TRANSFER_ID}/${FILE_ID}`,
      uploadId: UPLOAD_ID,
      partNumber: 3,
      expiresIn: 300
    })

    await expect(service.createMultipartPartIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      partNumber: 4,
      ttlSeconds: 300,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({
      code: 'MULTIPART_INVALID_PART'
    }))
    expect(createMultipartPartUrl).toHaveBeenCalledTimes(1)
  })

  it('does not sign new parts after multipart completion', async () => {
    const createMultipartPartUrl = vi.fn()
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow({
        status: 'completed',
        completed_at: NOW,
        file_state: 'uploaded',
        actual_size_bytes: declaration.fileSize,
        actual_mime_type: declaration.contentType,
        uploaded_at: NOW
      })) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      createMultipartPartUrl
    })

    await expect(service.createMultipartPartIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      partNumber: 1,
      ttlSeconds: 300,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({
      code: 'INTENT_UNAVAILABLE'
    }))
    expect(createMultipartPartUrl).not.toHaveBeenCalled()
  })

  it('does not reveal whether a mismatched transfer, file, or intent has a multipart upload', async () => {
    const listMultipartParts = vi.fn()
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => null) as never,
      listMultipartParts
    })

    await expect(service.resumeMultipartIntent({
      actor: ACTOR,
      transferId: '77777777-7777-4777-8777-777777777777',
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({ code: 'NOT_FOUND' }))
    expect(listMultipartParts).not.toHaveBeenCalled()
  })

  it('completes from the canonical R2 part list without caller-supplied ETags', async () => {
    const parts = [
      { partNumber: 1, sizeBytes: 16 * MiB, etag: 'etag-1' },
      { partNumber: 2, sizeBytes: 16 * MiB, etag: 'etag-2' },
      { partNumber: 3, sizeBytes: 9 * MiB, etag: 'etag-3' }
    ]
    const completeMultipartUpload = vi.fn(async () => undefined)
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_upload_intents i/.test(sql)) return { rows: [multipartIntentRow()] }
        if (/UPDATE send_files/.test(sql)) return { rows: [multipartIntentRow({
          status: 'completed',
          file_state: 'quarantined',
          actual_size_bytes: declaration.fileSize,
          actual_mime_type: declaration.contentType,
          object_etag: 'multipart-final-etag',
          uploaded_at: NOW
        })] }
        return { rows: [] }
      })
    }
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      transaction: (async callback => callback(db)) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      listMultipartParts: vi.fn(async () => parts),
      completeMultipartUpload,
      getObjectMetadata: vi.fn(async key => ({
        key,
        size: declaration.fileSize,
        contentType: declaration.contentType,
        etag: 'multipart-final-etag',
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
    })).resolves.toMatchObject({ state: 'quarantined', size: declaration.fileSize })
    expect(completeMultipartUpload).toHaveBeenCalledWith({
      key: `send/${TRANSFER_ID}/${FILE_ID}`,
      uploadId: UPLOAD_ID,
      parts
    })
    expect(db.query.mock.calls).toContainEqual([
      expect.stringMatching(/INSERT INTO send_scan_jobs/),
      [
        TRANSFER_ID,
        FILE_ID,
        `send/${TRANSFER_ID}/${FILE_ID}`,
        declaration.fileSize,
        declaration.contentType,
        'multipart-final-etag',
        'multipart',
        NOW.toISOString()
      ]
    ])
  })

  it('refuses multipart completion while any part is missing', async () => {
    const completeMultipartUpload = vi.fn()
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      listMultipartParts: vi.fn(async () => [
        { partNumber: 1, sizeBytes: 16 * MiB, etag: 'etag-1' },
        { partNumber: 3, sizeBytes: 9 * MiB, etag: 'etag-3' }
      ]),
      completeMultipartUpload
    })

    await expect(service.completeIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({
      code: 'MULTIPART_MISMATCH'
    }))
    expect(completeMultipartUpload).not.toHaveBeenCalled()
  })

  it('recovers completion when R2 finalized before database confirmation', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        if (/FROM send_upload_intents i/.test(sql)) return { rows: [multipartIntentRow()] }
        if (/UPDATE send_files/.test(sql)) return { rows: [multipartIntentRow({
          status: 'completed',
          file_state: 'quarantined',
          actual_size_bytes: declaration.fileSize,
          actual_mime_type: declaration.contentType,
          object_etag: 'multipart-final-etag',
          uploaded_at: NOW
        })] }
        return { rows: [] }
      })
    }
    const getObjectMetadata = vi.fn(async key => ({
      key,
      size: declaration.fileSize,
      contentType: declaration.contentType,
      etag: 'multipart-final-etag',
      uploaded: NOW
    }))
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      transaction: (async callback => callback(db)) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      listMultipartParts: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { name: 'NoSuchUpload' })
      }),
      getObjectMetadata
    })

    await expect(service.completeIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).resolves.toMatchObject({ state: 'quarantined', size: declaration.fileSize })
    expect(getObjectMetadata).toHaveBeenCalled()
  })

  it('aborts the canonical R2 upload before releasing the declared budget', async () => {
    const abortMultipartUpload = vi.fn(async () => undefined)
    const db = {
      query: vi.fn(async (sql: string) => ({
        rows: /FROM send_upload_intents i/.test(sql) ? [multipartIntentRow()] : []
      }))
    }
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      transaction: (async callback => callback(db)) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      abortMultipartUpload
    })

    await expect(service.abortIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).resolves.toEqual({ aborted: true })
    expect(abortMultipartUpload).toHaveBeenCalledWith({
      key: `send/${TRANSFER_ID}/${FILE_ID}`,
      uploadId: UPLOAD_ID
    })
    expect(db.query.mock.calls.some(([sql]) => /state = 'aborted'/.test(String(sql)))).toBe(true)
  })

  it('does not mark a multipart intent aborted when R2 already contains the final object', async () => {
    const transaction = vi.fn()
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      transaction: transaction as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      abortMultipartUpload: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { name: 'NoSuchUpload' })
      }),
      getObjectMetadata: vi.fn(async key => ({
        key,
        size: declaration.fileSize,
        contentType: declaration.contentType,
        etag: 'final-etag',
        uploaded: NOW
      }))
    })

    await expect(service.abortIntent({
      actor: ACTOR,
      transferId: TRANSFER_ID,
      fileId: FILE_ID,
      intentId: INTENT_ID,
      capability: CAPABILITY,
      now: NOW
    })).rejects.toEqual(expect.objectContaining<Partial<WorkspaceSendUploadError>>({
      code: 'INTENT_UNAVAILABLE'
    }))
    expect(transaction).not.toHaveBeenCalled()
  })

  it('finishes an abort retry when R2 already removed the incomplete upload', async () => {
    const db = {
      query: vi.fn(async (sql: string) => ({
        rows: /FROM send_upload_intents i/.test(sql) ? [multipartIntentRow()] : []
      }))
    }
    const service = createWorkspaceSendUploadService({
      queryOne: vi.fn(async () => multipartIntentRow()) as never,
      transaction: (async callback => callback(db)) as never,
      hashCapability: vi.fn(() => CAPABILITY_HASH),
      abortMultipartUpload: vi.fn(async () => {
        throw Object.assign(new Error('missing'), { name: 'NoSuchUpload' })
      }),
      getObjectMetadata: vi.fn(async () => null)
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
  })
})
