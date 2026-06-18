import { beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.getQuery = (event: any) => event.query ?? {}

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a),
}))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
}))

const mockLoadTenantPolicy = vi.fn()
vi.mock('~~/server/utils/video-generation/policy', () => ({
  loadTenantVideoGenerationPolicy: (...a: unknown[]) => mockLoadTenantPolicy(...a),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/models.get')

const projectId = '00000000-0000-4000-8000-000000000002'
const avProject = {
  id: projectId,
  clientId: '00000000-0000-4000-8000-000000000010',
  createdBy: 'user-1',
  mediaType: 'av',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })
  mockGetProject.mockResolvedValue({ project: avProject, timeline: { id: 'timeline-1' } })
  mockLoadTenantPolicy.mockResolvedValue({ enabled: true, monthlyCapCents: 1000 })
})

describe('GET /agency/video/generation/models', () => {
  it('returns selectable tenant-safe model options', async () => {
    const res = await handler({} as any)
    expect(res.models.some((model: any) => model.id === 'aigateway/seedance-i2v')).toBe(true)
    expect(res.models.some((model: any) => model.id === 'aigateway/veo-t2v-internal')).toBe(false)
    expect(res.models[0]).toHaveProperty('label')
    expect(res.models[0]).toHaveProperty('supportsNativeAudio')
  })

  it('returns no models when the project tenant policy is disabled', async () => {
    mockLoadTenantPolicy.mockResolvedValueOnce({ enabled: false, monthlyCapCents: 0, allowedModelIds: [] })

    const res = await handler({ query: { projectId } } as any)

    expect(mockLoadTenantPolicy).toHaveBeenCalledWith(avProject.clientId)
    expect(res).toEqual({ models: [], policy: { enabled: false, monthlyCapCents: 0 } })
  })

  it('returns models for an enabled project tenant policy', async () => {
    const res = await handler({ query: { projectId } } as any)

    expect(mockLoadTenantPolicy).toHaveBeenCalledWith(avProject.clientId)
    expect(res.models.some((model: any) => model.id === 'aigateway/seedance-i2v')).toBe(true)
    expect(res.policy).toEqual({ enabled: true, monthlyCapCents: 1000 })
  })

  it('rejects non-AV projects when scoped by project id', async () => {
    mockGetProject.mockResolvedValueOnce({ project: { ...avProject, mediaType: 'audio' }, timeline: null })

    await expect(handler({ query: { projectId } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockLoadTenantPolicy).not.toHaveBeenCalled()
  })
})
