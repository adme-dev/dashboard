import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { params?: Record<string, string> }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockGetAsset = vi.fn()
vi.mock('~~/server/utils/audio/assets', () => ({
  getAsset: (...args: unknown[]) => mockGetAsset(...args),
}))

const { default: handler } = await import('../../server/api/agency/audio/music/status/[id].get')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
})

describe('GET /agency/audio/music/status/:id', () => {
  it('returns the stable stream route for done music assets', async () => {
    mockGetAsset.mockResolvedValueOnce({
      id: 'm1',
      kind: 'music',
      status: 'done',
      streamUrl: '/api/agency/audio/assets/m1/stream',
      error: null,
    })

    const res = await handler({ params: { id: 'm1' } } as any)

    expect(res).toMatchObject({
      status: 'done',
      streamUrl: '/api/agency/audio/assets/m1/stream',
      error: null,
      asset: { id: 'm1', kind: 'music' },
    })
  })

  it('404s for non-music assets', async () => {
    mockGetAsset.mockResolvedValueOnce({ id: 'v1', kind: 'voiceover' })
    await expect(handler({ params: { id: 'v1' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })
})
