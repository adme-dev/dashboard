import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { query?: Record<string, any>; params?: Record<string, string>; body?: any; context?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getQuery = (e: TestEvent) => e.query ?? {}
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a)
}))

const mockGetProject = vi.fn()
const mockCreateRenderJob = vi.fn()
const mockListRenderJobs = vi.fn()
const mockMarkFailed = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
  createRenderJob: (...a: unknown[]) => mockCreateRenderJob(...a),
  listRenderJobs: (...a: unknown[]) => mockListRenderJobs(...a),
  markRenderJobFailed: (...a: unknown[]) => mockMarkFailed(...a)
}))

const mockEnqueue = vi.fn()
vi.mock('~~/server/utils/audio/renderQueue', () => ({
  enqueueTimelineRender: (...a: unknown[]) => mockEnqueue(...a)
}))

const { default: renderH } = await import('../../server/api/agency/audio/projects/[id]/render.post')
const { default: jobsH } = await import('../../server/api/agency/audio/projects/[id]/render-jobs.get')

const goodTimeline = {
  schema_version: 1, media_type: 'audio', sample_rate: 48000, duration_sec: 5,
  tracks: [{ id: 't', name: 'M', kind: 'music', clips: [
    { id: 'c', r2_key: 'k', timeline_start_sec: 0, source_out_sec: 5 } ] }],
  ducking: []
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
})

describe('POST /agency/audio/projects/:id/render', () => {
  it('404s when the project is missing', async () => {
    mockGetProject.mockResolvedValue(null)
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 404 })
  })
  it('409s when the project has no current timeline', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: null }, timeline: null })
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 409 })
  })
  it('400s when the current timeline is invalid', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: { ...goodTimeline, ducking: [
        { id: 'd', source_track_id: 't', target_track_id: 'missing', amount_db: -6 } ] } } })
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateRenderJob).not.toHaveBeenCalled()
  })
  it('defaults to all channels, creates the job, enqueues it, returns 202', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', clientId: 'c1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })
    const res = await renderH({ params: { id: 'p1' }, body: {}, context: {} } as any)
    expect(mockRequireWriteAccess).toHaveBeenCalled()
    const arg = mockCreateRenderJob.mock.calls[0][0]
    expect(arg).toEqual({ projectId: 'p1', requestedBy: 'u1', channels: ['radio', 'tiktok', 'meta'] })
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'j1', projectId: 'p1', timelineId: 't2', channels: ['radio', 'tiktok', 'meta'] })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    expect(res.job.id).toBe('j1')
  })
  it('passes an explicit channel subset through', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })
    await renderH({ params: { id: 'p1' }, body: { channels: ['radio'] }, context: {} } as any)
    expect(mockCreateRenderJob.mock.calls[0][0].channels).toEqual(['radio'])
  })
  it('400s on an unknown channel', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    await expect(renderH({ params: { id: 'p1' }, body: { channels: ['bogus'] }, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400 })
  })
  it('marks the job failed and 502s when enqueue throws', async () => {
    mockGetProject.mockResolvedValue({ project: { id: 'p1', currentTimelineId: 't1' },
      timeline: { id: 't1', state: goodTimeline } })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })
    mockEnqueue.mockRejectedValue(new Error('queue down'))
    await expect(renderH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 502 })
    expect(mockMarkFailed).toHaveBeenCalledWith('j1', expect.stringContaining('enqueue failed'))
  })
})

describe('GET /agency/audio/projects/:id/render-jobs', () => {
  it('lists render jobs', async () => {
    mockListRenderJobs.mockResolvedValue([{ id: 'j1' }])
    const res = await jobsH({ params: { id: 'p1' } } as any)
    expect(res).toEqual({ jobs: [{ id: 'j1' }] })
    expect(mockListRenderJobs).toHaveBeenCalledWith('p1')
  })
})
