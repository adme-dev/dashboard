import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const originalStorageEnv = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME
}

describe('readStoredObject', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.R2_ACCOUNT_ID
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_SECRET_ACCESS_KEY
    delete process.env.R2_BUCKET_NAME
  })

  afterEach(() => {
    for (const [key, value] of Object.entries({
      R2_ACCOUNT_ID: originalStorageEnv.accountId,
      R2_ACCESS_KEY_ID: originalStorageEnv.accessKeyId,
      R2_SECRET_ACCESS_KEY: originalStorageEnv.secretAccessKey,
      R2_BUCKET_NAME: originalStorageEnv.bucketName
    })) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })

  it('streams through the request-scoped R2 binding without S3 credentials', async () => {
    const { readStoredObject } = await import('~~/server/utils/storage')
    const bucket = {
      get: async () => ({
        body: new Blob(['page-studio-asset']).stream(),
        size: 17,
        httpEtag: '"asset-etag"',
        httpMetadata: { contentType: 'text/plain' }
      }),
      put: vi.fn(),
      head: vi.fn(),
      delete: vi.fn()
    }

    const object = await readStoredObject('page-studio/site/asset.txt', { requestBucket: bucket })

    expect(object).toMatchObject({
      contentType: 'text/plain',
      size: 17,
      range: null,
      etag: '"asset-etag"'
    })
    expect(await new Response(object?.body).text()).toBe('page-studio-asset')
  })
})
