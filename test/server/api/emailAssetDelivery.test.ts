import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isBannerAssetDeliveryKey,
  verifyBannerAssetToken
} from '~~/server/utils/bannerStorage'

const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockRequireWriteAccess = vi.hoisted(() => vi.fn())
const mockGetAssignedClientIds = vi.hoisted(() => vi.fn())
const mockQueryRowsFresh = vi.hoisted(() => vi.fn())
const mockQueryOne = vi.hoisted(() => vi.fn())
const mockReadMultipartFormData = vi.hoisted(() => vi.fn())
const mockUploadBannerAsset = vi.hoisted(() => vi.fn())
const mockSetHeader = vi.hoisted(() => vi.fn())

const USER_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_UPLOADER = '44444444-4444-4444-8444-444444444444'
const ROW_ID = '22222222-2222-4222-8222-222222222222'
const OBJECT_ID = '33333333-3333-4333-8333-333333333333'
const CLIENT_ID = '55555555-5555-4555-8555-555555555555'
const SECRET = 'render-link-secret-with-at-least-thirty-two-bytes'
const APP_URL = 'https://app.xeroflow.test'
const STORED_S3_URL = 'https://s3.amazonaws.com/media/hero.png?X-Amz-Expires=604800&X-Amz-Signature=expired'
const LEGACY_URL = 'https://cdn.example.com/legacy-hero.png'
const STORAGE_KEY = `banner-assets/${USER_ID}/${OBJECT_ID}/hero.png`

const scopedUser = {
  id: USER_ID,
  email: 'am@example.com',
  name: 'Account Manager',
  role: 'account_manager',
  is_active: true
}

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error
  getQuery: (event: { query?: Record<string, unknown> }) => Record<string, unknown>
  setHeader: typeof mockSetHeader
}

testGlobal.defineEventHandler = handler => handler
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getQuery = event => event.query ?? {}
testGlobal.setHeader = mockSetHeader

vi.mock('h3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('h3')>()
  return {
    ...actual,
    readMultipartFormData: (...args: unknown[]) => mockReadMultipartFormData(...args)
  }
})

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRowsFresh: (...args: unknown[]) => mockQueryRowsFresh(...args),
  queryRows: () => {
    throw new Error('Cached email asset library read')
  },
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/bannerStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/bannerStorage')>()
  return {
    ...actual,
    uploadBannerAsset: (...args: unknown[]) => mockUploadBannerAsset(...args)
  }
})

function bucket() {
  return { put: vi.fn(), head: vi.fn(), delete: vi.fn() }
}

function hostedEvent(env: Record<string, unknown> = {}) {
  return {
    query: {},
    context: {
      cloudflare: {
        env: {
          APP_URL,
          MEDIA_BUCKET: bucket(),
          RENDER_LINK_SECRET: SECRET,
          ...env
        }
      }
    }
  }
}

function imagePart(clientId?: string) {
  const parts: Array<{ name: string, filename?: string, type?: string, data: Buffer }> = [{
    name: 'file',
    filename: 'Hero.png',
    type: 'image/png',
    data: Buffer.from('image-bytes')
  }]
  if (clientId) parts.push({ name: 'client_id', data: Buffer.from(clientId) })
  return parts
}

function libraryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROW_ID,
    name: 'Hero.png',
    mimeType: 'image/png',
    fileSize: 12,
    r2Key: STORAGE_KEY,
    url: STORED_S3_URL,
    thumbnailUrl: null,
    tags: ['email', 'image'],
    uploadedBy: USER_ID,
    clientId: CLIENT_ID,
    createdAt: '2026-10-29T00:00:00.000Z',
    ...overrides
  }
}

describe('email asset canonical Banner Studio delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireAuth.mockResolvedValue(scopedUser)
    mockRequireWriteAccess.mockResolvedValue(scopedUser)
    mockGetAssignedClientIds.mockResolvedValue([CLIENT_ID])
    mockQueryRowsFresh.mockResolvedValue([])
    mockReadMultipartFormData.mockResolvedValue(imagePart(CLIENT_ID))
    mockUploadBannerAsset.mockImplementation(async (
      _buffer: Buffer,
      _fileName: string,
      _mimeType: string,
      _userId: string,
      key: string,
      native?: { assetUrl?: string },
      deliveryUrl?: string
    ) => ({
      key,
      url: native?.assetUrl ?? deliveryUrl ?? STORED_S3_URL,
      size: 11
    }))
    mockQueryOne.mockImplementation(async (_sql: string, params: unknown[]) => ({
      id: params[0],
      name: params[1],
      mimeType: params[2],
      fileSize: params[3],
      r2Key: params[4],
      url: params[5],
      thumbnailUrl: null,
      tags: params[6],
      uploadedBy: params[7],
      clientId: params[8],
      createdAt: '2026-10-29T01:00:00.000Z'
    }))
  })

  it('allocates the asset id and storage key, then stores a permanent signed delivery URL', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/upload.post')).default
    const request = hostedEvent()
    const calls: string[] = []
    mockUploadBannerAsset.mockImplementation(async (
      _buffer: Buffer,
      _fileName: string,
      _mimeType: string,
      _userId: string,
      key: string,
      native?: { assetUrl?: string }
    ) => {
      calls.push('upload')
      return { key, url: native?.assetUrl ?? STORED_S3_URL, size: 11 }
    })
    mockQueryOne.mockImplementation(async (_sql: string, params: unknown[]) => {
      calls.push('insert')
      return {
        id: params[0],
        name: params[1],
        mimeType: params[2],
        fileSize: params[3],
        r2Key: params[4],
        url: params[5],
        thumbnailUrl: null,
        tags: params[6],
        uploadedBy: params[7],
        clientId: params[8],
        createdAt: '2026-10-29T01:00:00.000Z'
      }
    })

    const result = await handler(request as never)
    const asset = (result as { asset: { id: string, url: string, r2Key: string, clientId: string } }).asset
    const uploadArgs = mockUploadBannerAsset.mock.calls[0]
    const insertSql = String(mockQueryOne.mock.calls[0]?.[0])
    const insertParams = mockQueryOne.mock.calls[0]?.[1] as unknown[]
    const token = new URL(asset.url).pathname.split('/').pop() ?? ''

    expect(calls).toEqual(['upload', 'insert'])
    expect(uploadArgs?.[1]).toBe('Hero.png')
    expect(uploadArgs?.[3]).toBe(USER_ID)
    expect(uploadArgs?.[4]).toBe(asset.r2Key)
    expect(uploadArgs?.[5]).toEqual({
      bucket: (request.context.cloudflare.env.MEDIA_BUCKET as object),
      assetUrl: asset.url
    })
    expect(isBannerAssetDeliveryKey(asset.r2Key, USER_ID)).toBe(true)
    expect(asset.r2Key.startsWith(`banner-assets/${USER_ID}/`)).toBe(true)
    expect(asset.r2Key.endsWith('/Hero.png')).toBe(true)
    expect(asset.url).toMatch(/^https:\/\/app\.xeroflow\.test\/api\/public\/banner-assets\/v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/)
    expect(asset.url).not.toContain('X-Amz-')
    expect(asset.url).not.toContain(asset.r2Key)
    await expect(verifyBannerAssetToken(token, SECRET)).resolves.toEqual({ version: 1, assetId: asset.id })
    expect(insertSql).toContain('INSERT INTO banner_assets (id,')
    expect(insertSql).not.toMatch(/\bUPDATE\b/i)
    expect(insertParams[0]).toBe(asset.id)
    expect(insertParams[4]).toBe(asset.r2Key)
    expect(insertParams[5]).toBe(asset.url)
    expect(insertParams[8]).toBe(CLIENT_ID)
    expect(asset.clientId).toBe(CLIENT_ID)
  })

  it('projects durable signed URLs for supported library keys and leaves unsupported rows untouched', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/index.get')).default
    const unsupported = libraryRow({
      id: '99999999-9999-4999-8999-999999999999',
      name: 'legacy.png',
      r2Key: 'email/legacy-hero.png',
      url: LEGACY_URL,
      uploadedBy: USER_ID
    })
    const foreignKey = libraryRow({
      id: '88888888-8888-4888-8888-888888888888',
      name: 'foreign.png',
      r2Key: `banner-assets/${OTHER_UPLOADER}/${OBJECT_ID}/foreign.png`,
      url: STORED_S3_URL,
      uploadedBy: USER_ID
    })
    mockQueryRowsFresh.mockResolvedValue([libraryRow(), unsupported, foreignKey])
    const request = hostedEvent()

    const result = await handler(request as never)
    const assets = (result as { assets: Array<{ id: string, url: string, r2Key: string }> }).assets
    const projected = assets.find(asset => asset.id === ROW_ID)
    const token = new URL(projected?.url ?? '').pathname.split('/').pop() ?? ''
    const sql = String(mockQueryRowsFresh.mock.calls[0]?.[0])

    expect(mockSetHeader).toHaveBeenCalledWith(request, 'Cache-Control', 'private, no-store')
    expect(sql).toMatch(/SELECT/i)
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE)\b/i)
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(projected?.url).not.toBe(STORED_S3_URL)
    expect(projected?.url).toMatch(/^https:\/\/app\.xeroflow\.test\/api\/public\/banner-assets\/v1\./)
    expect(projected?.r2Key).toBe(STORAGE_KEY)
    await expect(verifyBannerAssetToken(token, SECRET)).resolves.toEqual({ version: 1, assetId: ROW_ID })
    expect(token).not.toContain(OBJECT_ID)
    expect(assets.find(asset => asset.id === unsupported.id)?.url).toBe(LEGACY_URL)
    expect(assets.find(asset => asset.id === foreignKey.id)?.url).toBe(STORED_S3_URL)
  })

  it('fails closed before upload when hosted delivery binding or secret is absent', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/upload.post')).default
    const missingBucket = hostedEvent({ MEDIA_BUCKET: undefined })
    const missingSecret = hostedEvent({ RENDER_LINK_SECRET: undefined })
    const shortSecret = hostedEvent({ RENDER_LINK_SECRET: 'too-short' })

    await expect(handler(missingBucket as never)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'Banner asset storage is unavailable'
    })
    await expect(handler(missingSecret as never)).rejects.toMatchObject({ statusCode: 503 })
    await expect(handler(shortSecret as never)).rejects.toMatchObject({ statusCode: 503 })

    const previousSecret = process.env.RENDER_LINK_SECRET
    delete process.env.RENDER_LINK_SECRET
    try {
      await expect(handler({ context: {} } as never)).rejects.toMatchObject({
        statusCode: 503,
        statusMessage: 'Banner asset storage is unavailable'
      })
    } finally {
      if (previousSecret === undefined) delete process.env.RENDER_LINK_SECRET
      else process.env.RENDER_LINK_SECRET = previousSecret
    }

    expect(mockUploadBannerAsset).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('stores the signed delivery URL when local storage has a signing secret and no public bucket', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/upload.post')).default
    const previousSecret = process.env.RENDER_LINK_SECRET
    const previousAppUrl = process.env.APP_URL
    process.env.RENDER_LINK_SECRET = SECRET
    process.env.APP_URL = APP_URL
    try {
      const result = await handler({ context: {} } as never)
      const asset = (result as { asset: { url: string } }).asset
      expect(mockUploadBannerAsset).toHaveBeenCalledWith(
        Buffer.from('image-bytes'),
        'Hero.png',
        'image/png',
        USER_ID,
        expect.stringMatching(new RegExp(`^banner-assets/${USER_ID}/`)),
        undefined,
        asset.url
      )
      expect(asset.url).toMatch(/^https:\/\/app\.xeroflow\.test\/api\/public\/banner-assets\/v1\./)
      expect(asset.url).not.toContain('X-Amz-')
    } finally {
      if (previousSecret === undefined) delete process.env.RENDER_LINK_SECRET
      else process.env.RENDER_LINK_SECRET = previousSecret
      if (previousAppUrl === undefined) delete process.env.APP_URL
      else process.env.APP_URL = previousAppUrl
    }
  })

  it('fails closed on library reads that would otherwise return expiring URLs for supported keys', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/index.get')).default
    mockQueryRowsFresh.mockResolvedValue([libraryRow()])

    await expect(handler(hostedEvent({ MEDIA_BUCKET: undefined }) as never)).rejects.toMatchObject({
      statusCode: 503
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(String(mockQueryRowsFresh.mock.calls[0]?.[0])).not.toMatch(/\bUPDATE\b/i)
  })

  it('keeps an unsupported legacy row readable when signing material is absent', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/index.get')).default
    mockQueryRowsFresh.mockResolvedValue([libraryRow({
      r2Key: 'email/legacy-hero.png',
      url: LEGACY_URL
    })])

    await expect(handler(hostedEvent({ MEDIA_BUCKET: undefined, RENDER_LINK_SECRET: undefined }) as never)).resolves.toEqual({
      assets: [expect.objectContaining({ url: LEGACY_URL, r2Key: 'email/legacy-hero.png' })]
    })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects an out-of-scope upload before storage or insert', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/upload.post')).default
    mockGetAssignedClientIds.mockResolvedValue(['66666666-6666-4666-8666-666666666666', CLIENT_ID])
    mockReadMultipartFormData.mockResolvedValue(imagePart())

    await expect(handler(hostedEvent() as never)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'email_client_scope_required'
    })
    expect(mockUploadBannerAsset).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})
