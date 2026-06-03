import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { params?: Record<string, string> }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)
g.sendRedirect = vi.fn((_event: TestEvent, location: string, statusCode: number) => ({ location, statusCode }))

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

const mockPresign = vi.fn()
const mockIsStorageConfigured = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  getPresignedDownloadUrl: (...args: unknown[]) => mockPresign(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
}))

const { default: handler } = await import('../../server/api/agency/audio/assets/[id]/stream.get')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
  mockIsStorageConfigured.mockReturnValue(true)
  mockPresign.mockResolvedValue('https://signed.example.com/audio.wav')
})

describe('GET /agency/audio/assets/:id/stream', () => {
  it('requires write access', async () => {
    mockRequireWriteAccess.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handler({ params: { id: 'a1' } } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('redirects to a fresh presigned R2 URL for the asset master', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'a1', r2_key_master: 'audio/org/a1/master.wav' })

    const result = await handler({ params: { id: 'a1' } } as any)

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM audio_assets/i),
      ['a1']
    )
    expect(mockPresign).toHaveBeenCalledWith('audio/org/a1/master.wav', 300)
    expect(result).toEqual({ location: 'https://signed.example.com/audio.wav', statusCode: 302 })
  })

  it('404s when the asset has no playable master', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'a1', r2_key_master: null })
    await expect(handler({ params: { id: 'a1' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('redirects to the local upload route when R2 is not configured', async () => {
    mockIsStorageConfigured.mockReturnValue(false)
    mockQueryOne.mockResolvedValueOnce({ id: 'a1', r2_key_master: 'audio/org/a1/master.wav' })

    const result = await handler({ params: { id: 'a1' } } as any)

    expect(mockPresign).not.toHaveBeenCalled()
    expect(result).toEqual({ location: '/api/_uploads/audio/org/a1/master.wav', statusCode: 302 })
  })
})
