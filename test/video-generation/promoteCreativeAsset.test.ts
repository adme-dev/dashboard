import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  upload: vi.fn(),
  create: vi.fn()
}))

vi.mock('~~/server/utils/ai/tools/creativeAssets', () => ({
  findCreativeAssetById: (...args: unknown[]) => mocks.find(...args)
}))
vi.mock('~~/server/utils/storage', () => ({
  generateStorageKey: () => 'media-image/project/promoted.png',
  uploadFile: (...args: unknown[]) => mocks.upload(...args)
}))
vi.mock('~~/server/utils/video-generation/sourceAssetStore', () => ({
  createSourceAsset: (...args: unknown[]) => mocks.create(...args)
}))

import {
  assertSafeCreativeAssetUrl,
  promoteCreativeAssetToVideoSource
} from '~~/server/utils/video-generation/promoteCreativeAsset'

const ctx = {
  userId: 'user-1',
  userRole: 'owner',
  source: 'mcp',
  event: { context: { cloudflare: { env: { MEDIA_BUCKET: { put: vi.fn(), head: vi.fn(), delete: vi.fn() } } } } }
} as any

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue({
    assetId: 'monday:3163988655',
    filename: 'vehicle.png',
    source: 'monday',
    assetUrl: 'https://files.monday.com/vehicle.png',
    clientIds: ['client-1'],
    clientNames: ['Client'],
    sourceItemName: 'Campaign',
    provenance: { sourceSystem: 'monday', sourceItemId: 'item-1', sourceAssetId: '3163988655' }
  })
  mocks.upload.mockResolvedValue({ key: 'media-image/project/promoted.png', size: 3, url: 'https://owned.example/promoted.png' })
  mocks.create.mockResolvedValue({ id: 'source-1', status: 'approved' })
})

describe('creative registry promotion', () => {
  it('blocks local, private and non-HTTPS asset URLs', () => {
    expect(() => assertSafeCreativeAssetUrl('http://files.example.com/a.png')).toThrow(/HTTPS/)
    expect(() => assertSafeCreativeAssetUrl('https://127.0.0.1/a.png')).toThrow(/private/)
    expect(() => assertSafeCreativeAssetUrl('https://192.168.1.5/a.png')).toThrow(/private/)
    expect(() => assertSafeCreativeAssetUrl('https://localhost/a.png')).toThrow(/public/)
  })

  it('copies a governed Monday asset into owned storage and persists provenance', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'image/png', 'content-length': '3' }
    })) as typeof fetch

    const result = await promoteCreativeAssetToVideoSource({
      assetId: 'monday:3163988655',
      projectId: 'project-1',
      tenantId: 'client-1',
      subjectType: 'vehicle',
      expectedSourceSystem: 'monday',
      expectedSourceAssetRef: 'monday:3163988655'
    }, ctx, { fetchImpl })

    expect(result).toEqual({
      sourceAssetId: 'source-1', status: 'approved', sourceSystem: 'monday', sourceAssetRef: 'monday:3163988655'
    })
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.any(Buffer),
      'media-image/project/promoted.png',
      'image/png',
      expect.objectContaining({ sourceSystem: 'monday', sourceAssetRef: 'monday:3163988655' }),
      ctx.event.context.cloudflare.env.MEDIA_BUCKET
    )
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      sourceSystem: 'monday',
      sourceAssetRef: 'monday:3163988655',
      subjectType: 'vehicle'
    }))
  })
})
