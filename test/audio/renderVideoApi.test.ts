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

// T6: overlay resolution mocks
const mockLoadBannerLayers = vi.fn()
const mockResolveOverlayFormatKey = vi.fn()
vi.mock('~~/server/utils/audio/bannerOverlay', () => ({
  loadBannerLayers: (...a: unknown[]) => mockLoadBannerLayers(...a),
  resolveOverlayFormatKey: (...a: unknown[]) => mockResolveOverlayFormatKey(...a),
}))

const mockBuildBannerHTML = vi.fn()
vi.mock('~~/server/utils/banner/htmlBuilder', () => ({
  buildBannerHTML: (...a: unknown[]) => mockBuildBannerHTML(...a),
}))

const mockUploadFile = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: (...a: unknown[]) => mockUploadFile(...a),
  isStorageConfigured: () => false,
  validateFileType: vi.fn(),
  validateFileSize: vi.fn(),
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
const validOverlayHtml = '<script>window.__engagrFrame={ready:true,duration:5,seek:function(){}}</script>'

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

// T6: overlay resolution tests
describe('POST /agency/audio/projects/:id/render-video — overlay resolution', () => {
  const overlayTimeline = {
    id: 't1',
    state: {
      schema_version: 2,
      media_type: 'av',
      tracks: [
        {
          id: 'ovl',
          name: 'Overlay',
          kind: 'overlay',
          clips: [
            {
              type: 'overlay',
              id: 'o1',
              timeline_start_sec: 0,
              duration_sec: 10,
              gsap_project_id: 'bp1',
              gsap_format_key: 'fb_story',
            }
          ]
        }
      ]
    }
  }

  beforeEach(() => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'u1' })
    mockEnqueueVideoRender.mockResolvedValue(undefined)
    mockLoadBannerLayers.mockResolvedValue({ layers: [{ id: 'l1', type: 'text', text: 'Hi' }], width: 1080, height: 1920 })
    mockResolveOverlayFormatKey.mockReturnValue('fb_story')
    mockBuildBannerHTML.mockReturnValue(validOverlayHtml)
    mockUploadFile.mockResolvedValue({ key: 'media/p1/j1/overlay-o1.html', url: '/uploads/x', size: 20 })
  })

  it('calls loadBannerLayers + buildBannerHTML + uploadFile and enqueues resolvedOverlays', async () => {
    mockGetProject.mockResolvedValue({ project: avProject, timeline: overlayTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j1', timelineId: 't1', status: 'queued' })

    const res = await renderVideoH({
      params: { id: 'p1' },
      body: { formats: ['reels_9x16'] },
      context: {}
    } as any)

    // loadBannerLayers called with the project id + the gsap_format_key from the clip
    expect(mockLoadBannerLayers).toHaveBeenCalledWith('bp1', 'fb_story')

    // buildBannerHTML called with formatKey + layers
    expect(mockBuildBannerHTML).toHaveBeenCalledWith('fb_story', [{ id: 'l1', type: 'text', text: 'Hi' }], expect.any(Object))

    // uploadFile called with an html buffer, the expected R2 key, and text/html content-type
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      'media/p1/j1/reels_9x16/overlay-o1.html',
      'text/html'
    )

    // enqueueVideoRender message includes per-format resolved overlays.
    const msg = mockEnqueueVideoRender.mock.calls[0][1]
    expect(msg.resolvedOverlays).toBeUndefined()
    expect(msg.resolvedOverlaysByFormat).toEqual({
      reels_9x16: [
        {
          clipId: 'o1',
          htmlKey: 'media/p1/j1/reels_9x16/overlay-o1.html',
          timeline_start_sec: 0,
          duration_sec: 10,
        }
      ]
    })

    expect(res.job.id).toBe('j1')
  })

  it('uses resolveOverlayFormatKey when gsap_format_key is null', async () => {
    const noKeyTimeline = {
      id: 't1',
      state: {
        schema_version: 2,
        media_type: 'av',
        tracks: [
          {
            id: 'ovl',
            name: 'Overlay',
            kind: 'overlay',
            clips: [
              {
                type: 'overlay',
                id: 'o2',
                timeline_start_sec: 2,
                duration_sec: 5,
                gsap_project_id: 'bp2',
                gsap_format_key: null,
              }
            ]
          }
        ]
      }
    }
    mockGetProject.mockResolvedValue({ project: avProject, timeline: noKeyTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j2', timelineId: 't1', status: 'queued' })
    mockResolveOverlayFormatKey.mockReturnValue('fb_story')

    await renderVideoH({
      params: { id: 'p1' },
      body: { formats: ['reels_9x16'] },
      context: {}
    } as any)

    // When gsap_format_key is null, resolveOverlayFormatKey is used
    expect(mockResolveOverlayFormatKey).toHaveBeenCalled()
    expect(mockLoadBannerLayers).toHaveBeenCalledWith('bp2', 'fb_story')
  })

  it('resolves default overlay HTML separately for each requested render format', async () => {
    const noKeyTimeline = {
      id: 't1',
      state: {
        schema_version: 2,
        media_type: 'av',
        tracks: [
          {
            id: 'ovl',
            name: 'Overlay',
            kind: 'overlay',
            clips: [
              {
                type: 'overlay',
                id: 'o2',
                timeline_start_sec: 2,
                duration_sec: 5,
                gsap_project_id: 'bp2',
                gsap_format_key: null,
              }
            ]
          }
        ]
      }
    }
    mockGetProject.mockResolvedValue({ project: avProject, timeline: noKeyTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j2', timelineId: 't1', status: 'queued' })
    mockResolveOverlayFormatKey
      .mockReturnValueOnce('fb_story')
      .mockReturnValueOnce('tt_land')
    mockLoadBannerLayers
      .mockResolvedValueOnce({ layers: [{ id: 'portrait' }], width: 1080, height: 1920 })
      .mockResolvedValueOnce({ layers: [{ id: 'landscape' }], width: 1920, height: 1080 })
    mockBuildBannerHTML
      .mockReturnValueOnce(validOverlayHtml)
      .mockReturnValueOnce(validOverlayHtml)

    await renderVideoH({
      params: { id: 'p1' },
      body: { formats: ['reels_9x16', 'youtube_16x9'] },
      context: {}
    } as any)

    expect(mockResolveOverlayFormatKey).toHaveBeenCalledWith(1080, 1920)
    expect(mockResolveOverlayFormatKey).toHaveBeenCalledWith(1920, 1080)
    expect(mockLoadBannerLayers).toHaveBeenNthCalledWith(1, 'bp2', 'fb_story')
    expect(mockLoadBannerLayers).toHaveBeenNthCalledWith(2, 'bp2', 'tt_land')
    expect(mockBuildBannerHTML).toHaveBeenNthCalledWith(1, 'fb_story', [{ id: 'portrait' }], expect.any(Object))
    expect(mockBuildBannerHTML).toHaveBeenNthCalledWith(2, 'tt_land', [{ id: 'landscape' }], expect.any(Object))

    const msg = mockEnqueueVideoRender.mock.calls[0][1]
    expect(msg.resolvedOverlays).toBeUndefined()
    expect(msg.resolvedOverlaysByFormat).toEqual({
      reels_9x16: [
        {
          clipId: 'o2',
          htmlKey: 'media/p1/j2/reels_9x16/overlay-o2.html',
          timeline_start_sec: 2,
          duration_sec: 5,
        }
      ],
      youtube_16x9: [
        {
          clipId: 'o2',
          htmlKey: 'media/p1/j2/youtube_16x9/overlay-o2.html',
          timeline_start_sec: 2,
          duration_sec: 5,
        }
      ],
    })
  })

  it('400s when loadBannerLayers throws (missing project/format)', async () => {
    mockGetProject.mockResolvedValue({ project: avProject, timeline: overlayTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j3', timelineId: 't1', status: 'queued' })
    mockLoadBannerLayers.mockRejectedValue(new Error('banner project not found: bp1'))

    await expect(renderVideoH({ params: { id: 'p1' }, body: {}, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('400s when built overlay HTML fails render linting', async () => {
    mockGetProject.mockResolvedValue({ project: avProject, timeline: overlayTimeline })
    mockCreateRenderJob.mockResolvedValue({ id: 'j4', timelineId: 't1', status: 'queued' })
    mockBuildBannerHTML.mockReturnValue('<div>invalid overlay</div>')

    await expect(renderVideoH({ params: { id: 'p1' }, body: { formats: ['reels_9x16'] }, context: {} } as any))
      .rejects.toMatchObject({ statusCode: 400, statusMessage: expect.stringContaining('Overlay resolution failed') })
    expect(mockMarkFailed).toHaveBeenCalledWith('j4', expect.stringContaining('render runtime'))
    expect(mockUploadFile).not.toHaveBeenCalled()
  })
})
