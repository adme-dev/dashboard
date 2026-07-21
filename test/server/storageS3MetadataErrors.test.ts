import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  return {
    ...original,
    S3Client: class FakeS3Client {
      send = send
    }
  }
})

vi.mock('~~/server/utils/email', () => ({
  getCachedObjectBinding: vi.fn(() => undefined)
}))

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'] as const
const saved: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key]
  process.env.R2_ACCOUNT_ID = 'test-account'
  process.env.R2_ACCESS_KEY_ID = 'test-key'
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
  process.env.R2_BUCKET_NAME = 'fallback-bucket'
})

afterAll(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = saved[key]
  }
})

beforeEach(() => {
  vi.resetModules()
  send.mockReset()
})

describe('S3-compatible R2 metadata errors', () => {
  it('returns null only when R2 confirms that the object is absent', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('Not found'), {
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 }
    }))
    const { getFileMetadata } = await import('~~/server/utils/storage')

    await expect(getFileMetadata('send/transfer/file')).resolves.toBeNull()
  })

  it('preserves transient R2 failures so reconciliation does not report a false missing object', async () => {
    const outage = Object.assign(new Error('R2 unavailable'), {
      name: 'ServiceUnavailable',
      $metadata: { httpStatusCode: 503 }
    })
    send.mockRejectedValueOnce(outage)
    const { getFileMetadata } = await import('~~/server/utils/storage')

    await expect(getFileMetadata('send/transfer/file')).rejects.toBe(outage)
  })
})
