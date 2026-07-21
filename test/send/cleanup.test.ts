import { describe, expect, it, vi } from 'vitest'
import { createSendCleanupService, isOwnedSendObjectKey } from '../../server/utils/send/cleanup'

describe('Send retention cleanup', () => {
  it('accepts only object keys owned by the claimed transfer', () => {
    const transferId = '44444444-4444-4444-8444-444444444444'

    expect(isOwnedSendObjectKey(transferId, `send/${transferId}/file-id`)).toBe(true)
    expect(isOwnedSendObjectKey(transferId, `send/${transferId}/../other`)).toBe(false)
    expect(isOwnedSendObjectKey(transferId, 'send/another-transfer/file-id')).toBe(false)
    expect(isOwnedSendObjectKey(transferId, `send/${transferId}/`)).toBe(false)
  })

  it('claims, deletes, and finalizes an expired transfer', async () => {
    const transferId = '44444444-4444-4444-8444-444444444444'
    const fileId = '55555555-5555-4555-8555-555555555555'
    const objectKey = `send/${transferId}/${fileId}`
    let transactions = 0
    const claimDb = {
      query: vi.fn(async (sql: string) => {
        if (/RETURNING t\.id/.test(sql)) return { rows: [{ id: transferId }] }
        return { rows: [] }
      })
    }
    const finalizeDb = {
      query: vi.fn(async (sql: string) => /status = 'deleted'/.test(sql)
        ? { rows: [{ id: transferId }] }
        : { rows: [] })
    }
    const deleteObject = vi.fn(async () => undefined)
    const service = createSendCleanupService({
      transaction: (async (callback) => {
        transactions++
        return callback(transactions === 1 ? claimDb : finalizeDb)
      }) as never,
      queryRows: vi.fn(async () => [{ id: fileId, object_key: objectKey }]) as never,
      deleteObject
    })

    await expect(service.run({ now: new Date('2026-07-21T03:00:00.000Z') })).resolves.toEqual({
      claimed: 1,
      deletedTransfers: 1,
      deletedFiles: 1,
      failedTransfers: 0
    })
    expect(deleteObject).toHaveBeenCalledWith(objectKey)
    expect(claimDb.query.mock.calls.some(([sql]) =>
      /NOT EXISTS[\s\S]*send_upload_intents/.test(String(sql))
      && /INTERVAL '5 minutes'/.test(String(sql))
    )).toBe(true)
    expect(claimDb.query.mock.calls.some(([sql]) =>
      /FOR UPDATE SKIP LOCKED/.test(String(sql))
      && /deletion_claimed_at <[\s\S]*INTERVAL '15 minutes'/.test(String(sql))
    )).toBe(true)
    expect(finalizeDb.query.mock.calls.some(([sql]) => /state = 'deleted'/.test(String(sql)))).toBe(true)
    expect(finalizeDb.query.mock.calls.some(([sql]) => /status = 'deleted'/.test(String(sql)))).toBe(true)
  })

  it('retries an idempotent partial object deletion before finalizing the transfer', async () => {
    const transferId = '44444444-4444-4444-8444-444444444444'
    const firstKey = `send/${transferId}/55555555-5555-4555-8555-555555555555`
    const secondKey = `send/${transferId}/66666666-6666-4666-8666-666666666666`
    let runNumber = 0
    const finalized = vi.fn()
    const transaction = vi.fn(async (callback: (db: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => unknown) => {
      return callback({
        query: vi.fn(async (sql: string) => {
          if (/RETURNING t\.id/.test(sql)) {
            runNumber += 1
            return { rows: [{ id: transferId }] }
          }
          if (/status = 'deleted'/.test(sql)) {
            finalized()
            return { rows: [{ id: transferId }] }
          }
          return { rows: [] }
        })
      })
    })
    const deleteObject = vi.fn(async (key: string) => {
      if (runNumber === 1 && key === secondKey) throw new Error('temporary delete failure')
    })
    const service = createSendCleanupService({
      transaction: transaction as never,
      queryRows: vi.fn(async () => [
        { id: 'first', object_key: firstKey },
        { id: 'second', object_key: secondKey }
      ]) as never,
      deleteObject
    })

    await expect(service.run()).resolves.toMatchObject({
      claimed: 1,
      deletedTransfers: 0,
      failedTransfers: 1
    })
    await expect(service.run()).resolves.toMatchObject({
      claimed: 1,
      deletedTransfers: 1,
      deletedFiles: 2,
      failedTransfers: 0
    })
    expect(deleteObject.mock.calls.map(([key]) => key)).toEqual([
      firstKey,
      secondKey,
      firstKey,
      secondKey
    ])
    expect(finalized).toHaveBeenCalledOnce()
  })

  it('leaves a transfer pending when an object key fails ownership validation', async () => {
    const transferId = '44444444-4444-4444-8444-444444444444'
    const claimDb = {
      query: vi.fn(async (sql: string) => /RETURNING t\.id/.test(sql)
        ? { rows: [{ id: transferId }] }
        : { rows: [] })
    }
    const deleteObject = vi.fn()
    const service = createSendCleanupService({
      transaction: (async callback => callback(claimDb)) as never,
      queryRows: vi.fn(async () => [{ id: 'file-id', object_key: 'send/wrong/file-id' }]) as never,
      deleteObject
    })

    await expect(service.run()).resolves.toMatchObject({
      claimed: 1,
      deletedTransfers: 0,
      failedTransfers: 1
    })
    expect(deleteObject).not.toHaveBeenCalled()
  })
})
