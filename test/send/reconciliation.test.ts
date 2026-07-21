import { describe, expect, it, vi } from 'vitest'
import { createSendReconciliationService } from '../../server/utils/send/reconciliation'

const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'
const KNOWN_FILE_ID = '55555555-5555-4555-8555-555555555555'
const MISSING_FILE_ID = '66666666-6666-4666-8666-666666666666'
const ORPHAN_FILE_ID = '77777777-7777-4777-8777-777777777777'
const DELETED_FILE_ID = '88888888-8888-4888-8888-888888888888'

describe('Send storage reconciliation', () => {
  it('classifies bounded storage and database drift without exposing storage capabilities', async () => {
    const knownKey = `send/${TRANSFER_ID}/${KNOWN_FILE_ID}`
    const missingKey = `send/${TRANSFER_ID}/${MISSING_FILE_ID}`
    const orphanKey = `send/${TRANSFER_ID}/${ORPHAN_FILE_ID}`
    const deletedKey = `send/${TRANSFER_ID}/${DELETED_FILE_ID}`
    const malformedKey = 'send/not-a-transfer/unknown-object'
    const queryRows = vi.fn(async (sql: string) => {
      if (/object_key = ANY/.test(sql)) {
        return [
          { object_key: knownKey, state: 'clean' },
          { object_key: deletedKey, state: 'deleted' }
        ]
      }
      if (/f\.state IN/.test(sql)) {
        return [
          { transfer_id: TRANSFER_ID, file_id: KNOWN_FILE_ID, object_key: knownKey },
          { transfer_id: TRANSFER_ID, file_id: MISSING_FILE_ID, object_key: missingKey }
        ]
      }
      if (/FROM send_upload_intents i/.test(sql)) {
        return [
          {
            intent_id: '99999999-9999-4999-8999-999999999999',
            transfer_id: TRANSFER_ID,
            file_id: KNOWN_FILE_ID,
            upload_method: 'single',
            multipart_upload_id: null
          },
          {
            intent_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            transfer_id: TRANSFER_ID,
            file_id: MISSING_FILE_ID,
            upload_method: 'multipart',
            multipart_upload_id: 'secret-upload-id'
          }
        ]
      }
      if (/FROM send_transfers t/.test(sql)) {
        return [{ transfer_id: TRANSFER_ID }]
      }
      return []
    })
    const listObjects = vi.fn(async () => ({
      objects: [knownKey, orphanKey, deletedKey, malformedKey].map(key => ({ key })),
      truncated: false
    }))
    const getObjectMetadata = vi.fn(async (key: string) => key === knownKey ? { key } : null)
    const service = createSendReconciliationService({
      queryRows: queryRows as never,
      listObjects,
      getObjectMetadata: getObjectMetadata as never
    })

    const result = await service.run({
      now: new Date('2026-07-21T08:00:00.000Z'),
      objectPageSize: 100,
      databaseBatchSize: 100
    })

    expect(result).toMatchObject({
      scannedObjects: 4,
      scannedFiles: 2,
      scannedIntents: 2,
      orphanObjects: 3,
      malformedObjects: 1,
      missingObjects: 1,
      metadataCheckFailures: 0,
      staleIntents: 2,
      staleMultipartUploads: 1,
      retryableDeletionFailures: 1,
      storageTruncated: false
    })
    expect(result.issues.map(issue => issue.type)).toEqual([
      'orphan_object',
      'orphan_object',
      'orphan_object',
      'missing_object',
      'stale_upload_intent',
      'stale_multipart_upload',
      'retryable_deletion_failure'
    ])
    expect(result.issues).toContainEqual(expect.objectContaining({
      type: 'orphan_object',
      transferId: TRANSFER_ID,
      fileId: ORPHAN_FILE_ID,
      objectFingerprint: expect.stringMatching(/^[a-f0-9]{16}$/)
    }))
    expect(JSON.stringify(result)).not.toContain('send/')
    expect(JSON.stringify(result)).not.toContain('secret-upload-id')
    expect(listObjects).toHaveBeenCalledWith({ prefix: 'send/', limit: 100 })
    expect(queryRows.mock.calls.some(([, params]) => params?.[0] === '2026-07-21T08:00:00.000Z')).toBe(true)
  })

  it('reports metadata lookup failures instead of misclassifying them as missing objects', async () => {
    const objectKey = `send/${TRANSFER_ID}/${KNOWN_FILE_ID}`
    const queryRows = vi.fn(async (sql: string) => {
      if (/f\.state IN/.test(sql)) {
        return [{ transfer_id: TRANSFER_ID, file_id: KNOWN_FILE_ID, object_key: objectKey }]
      }
      return []
    })
    const service = createSendReconciliationService({
      queryRows: queryRows as never,
      listObjects: vi.fn(async () => ({ objects: [], truncated: false })),
      getObjectMetadata: vi.fn(async () => { throw new Error('temporary R2 failure') }) as never
    })

    await expect(service.run()).resolves.toMatchObject({
      scannedFiles: 1,
      missingObjects: 0,
      metadataCheckFailures: 1
    })
  })
})
