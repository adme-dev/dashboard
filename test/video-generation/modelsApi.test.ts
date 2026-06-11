import { beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/models.get')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
})

describe('GET /agency/video/generation/models', () => {
  it('returns selectable tenant-safe model options', async () => {
    const res = await handler({} as any)
    expect(res.models.some((model: any) => model.id === 'aigateway/seedance-i2v')).toBe(true)
    expect(res.models.some((model: any) => model.id === 'aigateway/veo-t2v-internal')).toBe(false)
    expect(res.models[0]).toHaveProperty('label')
    expect(res.models[0]).toHaveProperty('supportsNativeAudio')
  })
})
