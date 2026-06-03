import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; body?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.createError = (i: { statusCode: number; statusMessage: string }) => Object.assign(new Error(i.statusMessage), i)

const mockRequireAuth = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireAuth: (...a: unknown[]) => mockRequireAuth(...a) }))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a)
}))

const mockPresign = vi.fn()
const mockIsConfigured = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  getPresignedDownloadUrl: (...a: unknown[]) => mockPresign(...a),
  isStorageConfigured: (...a: unknown[]) => mockIsConfigured(...a)
}))

const { TimelineStateSchema } = await import('~~/server/utils/audio/timelineSchema')
const { default: handler } = await import('../../server/api/agency/audio/projects/[id]/clip-sources.get')

const state = TimelineStateSchema.parse({
  tracks: [
    { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
    { id: 'mus', name: 'M', kind: 'music', clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] },
    { id: 'sfx', name: 'S', kind: 'sfx', muted: true, clips: [{ id: 'x', r2_key: 'k/x', timeline_start_sec: 0, source_out_sec: 2 }] }
  ]
})
// The gateway returns the MediaTimeline WRAPPER; the TimelineState is in `.state`.
const timeline = { id: 't1', projectId: 'p1', version: 1, label: null, state, schemaVersion: 1, createdBy: 'u1', createdAt: '2026-06-03T00:00:00Z' }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockIsConfigured.mockReturnValue(true)
  mockPresign.mockImplementation(async (key: string) => `https://signed/${key}`)
})

describe('GET /agency/audio/projects/:id/clip-sources', () => {
  it('requires auth', async () => {
    mockRequireAuth.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handler({ params: { id: 'p1' } } as any)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('404s when the project (org-scoped) is not found', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(handler({ params: { id: 'p1' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('presigns ONLY the non-muted timeline keys, never an arbitrary key', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: { 'k/a': 'https://signed/k/a', 'k/b': 'https://signed/k/b' } })
    const presignedKeys = mockPresign.mock.calls.map((c) => c[0]).sort()
    expect(presignedKeys).toEqual(['k/a', 'k/b'])   // NOT 'k/x' (muted)
  })

  it('omits a key whose presign throws (rest still returned)', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline })
    mockPresign.mockImplementation(async (key: string) => {
      if (key === 'k/b') throw new Error('presign boom')
      return `https://signed/${key}`
    })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: { 'k/a': 'https://signed/k/a' } })
  })

  it('returns empty sources when the project has no current timeline', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline: null })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: {} })
  })

  it('returns empty sources when the timeline state is unparseable', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1' }, timeline: { ...timeline, state: { not: 'a timeline' } } })
    const res = await handler({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ sources: {} })
    expect(mockPresign).not.toHaveBeenCalled()
  })
})
