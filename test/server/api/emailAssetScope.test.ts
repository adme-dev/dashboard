import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetQuery = vi.fn()
const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockGetAssignedClientIds = vi.fn()
const mockQueryRows = vi.fn()
const mockQueryOne = vi.fn()
const mockReadMultipartFormData = vi.fn()
const mockUploadBannerAsset = vi.fn()

const scopedUser = {
  id: 'user-1',
  email: 'am@example.com',
  name: 'Account Manager',
  role: 'account_manager',
  is_active: true
}

const agencyUser = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Admin',
  role: 'admin',
  is_active: true
}

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(fn: T) => T
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) => Error & {
    statusCode: number
    statusMessage: string
    data?: unknown
  }
  getQuery: typeof mockGetQuery
}

testGlobal.defineEventHandler = fn => fn
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.getQuery = mockGetQuery

vi.mock('h3', () => ({
  createError: (input: { statusCode: number, statusMessage: string, data?: unknown }) =>
    Object.assign(new Error(input.statusMessage), input),
  readMultipartFormData: (...args: unknown[]) => mockReadMultipartFormData(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/clientScoping', () => ({
  getAssignedClientIds: (...args: unknown[]) => mockGetAssignedClientIds(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/bannerStorage', () => ({
  uploadBannerAsset: (...args: unknown[]) => mockUploadBannerAsset(...args)
}))

describe('email asset client-scoped policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetQuery.mockReturnValue({})
    mockRequireAuth.mockResolvedValue(scopedUser)
    mockRequireWriteAccess.mockResolvedValue(scopedUser)
    mockGetAssignedClientIds.mockResolvedValue(['client-1'])
    mockQueryRows.mockResolvedValue([])
    mockQueryOne.mockResolvedValue({
      id: 'asset-1',
      name: 'hero.png',
      mimeType: 'image/png',
      fileSize: 12,
      r2Key: 'email/hero.png',
      url: 'https://cdn.example.com/hero.png',
      thumbnailUrl: null,
      tags: ['email', 'image'],
      uploadedBy: 'user-1',
      clientId: 'client-1',
      createdAt: '2026-06-05T00:00:00.000Z'
    })
    mockReadMultipartFormData.mockResolvedValue([
      {
        name: 'file',
        filename: 'hero.png',
        type: 'image/png',
        data: Buffer.from('image-bytes')
      }
    ])
    mockUploadBannerAsset.mockResolvedValue({
      key: 'email/hero.png',
      url: 'https://cdn.example.com/hero.png',
      size: 12
    })
  })

  it('filters email image assets to assigned clients for scoped users', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/index.get')).default

    await handler({} as never)

    expect(mockGetAssignedClientIds).toHaveBeenCalledWith(expect.anything(), 'user-1')
    expect(String(mockQueryRows.mock.calls[0]?.[0])).toContain('client_id = ANY($2::uuid[])')
    expect(mockQueryRows.mock.calls[0]?.[1]).toEqual([
      expect.any(Array),
      ['client-1']
    ])
  })

  it('keeps agency email image asset reads unfiltered', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/index.get')).default
    mockRequireAuth.mockResolvedValueOnce(agencyUser)

    await handler({} as never)

    expect(mockGetAssignedClientIds).not.toHaveBeenCalled()
    expect(String(mockQueryRows.mock.calls[0]?.[0])).not.toContain('client_id = ANY')
  })

  it('stores uploaded email image assets against the scoped actor assigned client', async () => {
    const handler = (await import('~~/server/api/agency/email/assets/upload.post')).default

    await handler({} as never)

    expect(mockUploadBannerAsset).toHaveBeenCalledWith(
      Buffer.from('image-bytes'),
      expect.stringMatching(/hero/),
      'image/png',
      'user-1'
    )
    expect(String(mockQueryOne.mock.calls[0]?.[0])).toContain('client_id')
    expect(mockQueryOne.mock.calls[0]?.[1]).toEqual([
      'hero.png',
      'image/png',
      12,
      'email/hero.png',
      'https://cdn.example.com/hero.png',
      ['email', 'image'],
      'user-1',
      'client-1'
    ])
  })
})
