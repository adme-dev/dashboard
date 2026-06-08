import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
const mockMarkFailed = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
  createRenderJob: (...a: unknown[]) => mockCreateRenderJob(...a),
  markRenderJobFailed: (...a: unknown[]) => mockMarkFailed(...a)
}))

const mockEnqueueVideoRender = vi.fn()
vi.mock('~~/server/utils/audio/renderQueue', () => ({
  enqueueVideoRender: (...a: unknown[]) => mockEnqueueVideoRender(...a),
  enqueueTimelineRender: vi.fn()
}))

const { default: renderVideoH } = await import('../../server/api/agency/audio/projects/[id]/render-video.post')

const avProject = {
  id: 'p1',
  mediaType: 'av',
  currentTimelineId: 't1',
  status: 'draft'
}
const audioProject = {
  id: 'p2',
  mediaType: 'audio',
  currentTimelineId: 't1',
  status: 'draft'
}
const goodTimeline = { id: 't1', state: {} }

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireAuth.mockResolvedValue({ id: 'u1' })
  mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
  process.env.VIDEO_STUDIO_ENABLED = 'true'
})

afterEach(() => {
  delete process.env.VIDEO_STUDIO_ENABLED
})

describe('POST /agency/audio/projects/:id/render-video', () => {
  it('calls createRenderJob then enqueueVideoRender with jobId/projectId/timelineId/formats for an AV project', async () => {
    mockGetProject.mockResolvedValue({ project: avProject, timeline: goodTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })

    const res = await renderVideoH({ params: { id: 'p1' }, body: {}, context: {} } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    // createRenderJob called with projectId + requestedBy
    const jobArg = mockCreateRenderJob.mock.calls[0][0]
    expect(jobArg.projectId).toBe('p1')
    expect(jobArg.requestedBy).toBe('u1')

    // enqueueVideoRender called with the right message
    expect(mockEnqueueVideoRender).toHaveBeenCalledWith(
      expect.anything(),
      { jobId: 'j1', projectId: 'p1', timelineId: 't2', formats: ['reels_9x16', 'square_1x1', 'youtube_16x9'] }
    )
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    expect(res.job.id).toBe('j1')
  })

  it('400s when the project mediaType is audio (not av)', async () => {
    mockGetProject.mockResolvedValue({ project: audioProject, timeline: goodTimeline })

    await expect(renderVideoH({ params: { id: 'p2' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateRenderJob).not.toHaveBeenCalled()
  })

  it('throws 404 when VIDEO_STUDIO_ENABLED is not set', async () => {
    delete process.env.VIDEO_STUDIO_ENABLED

    await expect(renderVideoH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 404 })
    expect(mockGetProject).not.toHaveBeenCalled()
  })

  it('marks job failed and 502s when enqueueVideoRender throws', async () => {
    mockGetProject.mockResolvedValue({ project: avProject, timeline: goodTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't2', status: 'queued' })
    mockEnqueueVideoRender.mockRejectedValue(new Error('queue unavailable'))

    await expect(renderVideoH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 502 })
    expect(mockMarkFailed).toHaveBeenCalledWith('j1', expect.stringContaining('enqueue failed'))
  })
})
