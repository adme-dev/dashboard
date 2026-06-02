import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; body?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: { statusCode: number; statusMessage: string; data?: any }) =>
  Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a)
}))

const mockListProjects = vi.fn()
const mockCreateProject = vi.fn()
const mockGetProject = vi.fn()
const mockSaveDraft = vi.fn()
const mockCreateVersion = vi.fn()
const mockListVersions = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  listProjects: (...a: unknown[]) => mockListProjects(...a),
  createProject: (...a: unknown[]) => mockCreateProject(...a),
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
  saveDraftTimeline: (...a: unknown[]) => mockSaveDraft(...a),
  createVersion: (...a: unknown[]) => mockCreateVersion(...a),
  listVersions: (...a: unknown[]) => mockListVersions(...a)
}))

const { default: listH } = await import('../../server/api/agency/audio/projects/index.get')
const { default: createH } = await import('../../server/api/agency/audio/projects/index.post')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
})

describe('GET /agency/audio/projects', () => {
  it('lists projects, passing the clientId filter through', async () => {
    mockListProjects.mockResolvedValue([{ id: 'p1' }])
    const res = await listH({ query: { clientId: '11111111-1111-1111-1111-111111111111' } } as any)
    expect(res).toEqual({ projects: [{ id: 'p1' }] })
    expect(mockListProjects).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111')
  })
  it('lists all projects when no filter', async () => {
    mockListProjects.mockResolvedValue([])
    await listH({ query: {} } as any)
    expect(mockListProjects).toHaveBeenCalledWith(undefined)
  })
})

describe('POST /agency/audio/projects', () => {
  it('creates a project with a normalized initial timeline', async () => {
    mockCreateProject.mockResolvedValue({ project: { id: 'p1' }, timeline: { id: 't1', version: 1 } })
    const res = await createH({ body: { title: 'Promo', clientId: null } } as any)
    expect(res.project.id).toBe('p1')
    expect(mockRequireWriteAccess).toHaveBeenCalled()
    const arg = mockCreateProject.mock.calls[0][0]
    expect(arg.createdBy).toBe('u1')
    expect(arg.initialState.schema_version).toBe(1)
    expect(arg.initialState.tracks).toEqual([])
  })
  it('400s when the provided initial timeline fails validation', async () => {
    const badState = {
      schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 0,
      tracks: [{ id: 't', name: 'A', kind: 'music', clips: [] }],
      ducking: [{ id: 'd', source_track_id: 't', target_track_id: 'missing', amount_db: -6 }]
    }
    await expect(createH({ body: { initialState: badState } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateProject).not.toHaveBeenCalled()
  })
})
