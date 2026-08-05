import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Worker-native R2 operations receive MEDIA_BUCKET explicitly from the request;
// object capabilities are never recovered from module-global mutable state.

const ENV_KEYS = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL'] as const
const saved: Record<string, string | undefined> = {}

beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k]
  // Make isStorageConfigured() true so the local-fs fallback is skipped.
  process.env.R2_ACCOUNT_ID = 'test-account'
  process.env.R2_ACCESS_KEY_ID = 'test-key'
  process.env.R2_SECRET_ACCESS_KEY = 'test-secret'
  process.env.R2_BUCKET_NAME = 'agency-files'
  // Public URL avoids presigning (which would need a real S3 client call path).
  process.env.R2_PUBLIC_URL = 'https://files.example.com'
})

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) Reflect.deleteProperty(process.env, k)
    else process.env[k] = saved[k]
  }
})

describe('uploadFile native R2 binding', () => {
  it('prefers an explicitly provided request-scoped MEDIA_BUCKET binding', async () => {
    const { setCfBindings } = await import('~~/server/utils/email')
    const { uploadFile } = await import('~~/server/utils/storage')
    const put = vi.fn(async () => {})
    const head = vi.fn(async () => ({ size: 8 }))
    const mediaBucket = { put, head, delete: vi.fn() }
    setCfBindings({})

    const result = await uploadFile(
      Buffer.from('hello r2'),
      'media-image/request-scoped.png',
      'image/png',
      undefined,
      mediaBucket
    )

    expect(put).toHaveBeenCalledTimes(1)
    expect(head).toHaveBeenCalledWith('media-image/request-scoped.png')
    expect(result).toEqual({
      key: 'media-image/request-scoped.png',
      url: 'https://files.example.com/media-image/request-scoped.png',
      size: 8
    })
  })

  it('writes via the originating MEDIA_BUCKET binding and verifies persistence', async () => {
    const { uploadFile } = await import('~~/server/utils/storage')

    const stored = new Map<string, Uint8Array>()
    const put = vi.fn(async (key: string, value: Uint8Array) => {
      stored.set(key, value)
    })
    const head = vi.fn(async (key: string) => {
      const v = stored.get(key)
      return v ? { size: v.byteLength } : null
    })
    const mediaBucket = { put, head, delete: vi.fn() }

    const result = await uploadFile(
      Buffer.from('hello r2'),
      'media-image/test.png',
      'image/png',
      { source: 'test' },
      mediaBucket
    )

    expect(put).toHaveBeenCalledTimes(1)
    expect(put.mock.calls[0]![0]).toBe('media-image/test.png')
    expect(put.mock.calls[0]![2]).toEqual({ httpMetadata: { contentType: 'image/png' }, customMetadata: { source: 'test' } })
    expect(head).toHaveBeenCalledWith('media-image/test.png')
    expect(result).toEqual({ key: 'media-image/test.png', url: 'https://files.example.com/media-image/test.png', size: 8 })
  })

  it('throws loudly when the native put does not persist', async () => {
    const { uploadFile } = await import('~~/server/utils/storage')

    const mediaBucket = {
      put: vi.fn(async () => {}),
      head: vi.fn(async () => null),
      delete: vi.fn()
    }

    await expect(uploadFile(Buffer.from('x'), 'media-image/gone.png', 'image/png', undefined, mediaBucket))
      .rejects.toThrow(/R2 write failed/)
  })

  it('reads canonical confirmation metadata through the native binding', async () => {
    const { getFileMetadata } = await import('~~/server/utils/storage')
    const uploaded = new Date('2026-07-21T00:00:00.000Z')
    const head = vi.fn(async () => ({
      key: 'send/transfer/file',
      size: 2048,
      etag: 'etag-1',
      httpEtag: '"etag-1"',
      uploaded,
      httpMetadata: { contentType: 'application/pdf' },
      customMetadata: { source: 'send' }
    }))
    const mediaBucket = { put: vi.fn(), head, delete: vi.fn() }

    await expect(getFileMetadata('send/transfer/file', mediaBucket)).resolves.toEqual({
      size: 2048,
      contentType: 'application/pdf',
      etag: 'etag-1',
      lastModified: uploaded,
      metadata: { source: 'send' }
    })
    expect(head).toHaveBeenCalledWith('send/transfer/file')
  })

  it('deletes through the request-owned binding when S3 credentials are absent', async () => {
    const configured = Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]))
    for (const key of ENV_KEYS) Reflect.deleteProperty(process.env, key)
    vi.resetModules()

    try {
      const { deleteFile } = await import('~~/server/utils/storage')
      const deleteObject = vi.fn(async () => {})
      const mediaBucket = {
        put: vi.fn(),
        head: vi.fn(),
        delete: deleteObject
      }

      await deleteFile('banner-assets/owner/object/source.jpg', mediaBucket)

      expect(deleteObject).toHaveBeenCalledWith('banner-assets/owner/object/source.jpg')
    } finally {
      for (const key of ENV_KEYS) {
        const value = configured[key]
        if (value === undefined) Reflect.deleteProperty(process.env, key)
        else process.env[key] = value
      }
      vi.resetModules()
    }
  })
})
