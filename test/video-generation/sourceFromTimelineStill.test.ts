import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.readBody = async (e: any) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({ requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a) }))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
}))

const mockCreateSourceAsset = vi.fn()
vi.mock('~~/server/utils/video-generation/sourceAssetStore', () => ({
  createSourceAsset: (...a: unknown[]) => mockCreateSourceAsset(...a),
}))

const { default: handler } = await import('../../server/api/agency/video/generation/source-assets/from-timeline-still.post')

const projectId = '00000000-0000-4000-8000-000000000111'

function avProject(overrides: any = {}) {
  return {
    project: { id: projectId, clientId: 'dealer-1', mediaType: 'av', ...overrides.project },
    timeline: {
      state: {
        tracks: [
          {
            id: 'vid',
            kind: 'video',
            clips: [
              { id: 'clip-still', base_source: 'still_kenburns', r2_key: 'media/p/still.webp', timeline_start_sec: 2 },
              { id: 'clip-footage', base_source: 'uploaded_footage', r2_key: 'media/p/footage.mp4', timeline_start_sec: 5 },
            ],
          },
        ],
      },
      ...overrides.timeline,
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })
  mockGetProject.mockResolvedValue(avProject({ project: { createdBy: 'user-1' } }))
  mockCreateSourceAsset.mockResolvedValue({ id: 'src-1', status: 'approved' })
})

afterEach(() => {
  delete process.env.VIDEO_GENERATION_ENABLED
})

describe('POST /agency/video/generation/source-assets/from-timeline-still', () => {
  it('registers a still clip from the current timeline as an approved source', async () => {
    const res = await handler({ body: { projectId, clipId: 'clip-still', subjectType: 'vehicle' } } as any)

    expect(mockGetProject).toHaveBeenCalledWith(projectId)
    expect(mockCreateSourceAsset).toHaveBeenCalledWith({
      clientId: 'dealer-1',
      createdBy: 'user-1',
      r2Key: 'media/p/still.webp',
      contentType: 'image/webp',
      subjectType: 'vehicle',
    })
    expect(res).toEqual({ id: 'src-1', status: 'approved' })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
  })

  it('404s when the feature is disabled', async () => {
    delete process.env.VIDEO_GENERATION_ENABLED
    await expect(handler({ body: { projectId, clipId: 'clip-still' } } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()
  })

  it('404s for non-still clips or missing timelines', async () => {
    await expect(handler({ body: { projectId, clipId: 'clip-footage' } } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()

    mockGetProject.mockResolvedValueOnce(null)
    await expect(handler({ body: { projectId, clipId: 'clip-still' } } as any)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects still clips whose source key is not an image', async () => {
    mockGetProject.mockResolvedValueOnce(avProject({
      project: { createdBy: 'user-1' },
      timeline: {
        state: {
          tracks: [{ id: 'vid', kind: 'video', clips: [{ id: 'clip-still', base_source: 'still_kenburns', r2_key: 'media/p/not-an-image.mp4' }] }],
        },
      },
    }))

    await expect(handler({ body: { projectId, clipId: 'clip-still' } } as any)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()
  })

  it('forbids non-admin users from registering stills from another user project', async () => {
    mockGetProject.mockResolvedValueOnce(avProject({ project: { createdBy: 'user-2' } }))

    await expect(handler({ body: { projectId, clipId: 'clip-still' } } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockCreateSourceAsset).not.toHaveBeenCalled()
  })

  it('allows owner/admin roles to register a still from an accessible agency project', async () => {
    mockRequireWriteAccess.mockResolvedValueOnce({ id: 'owner-1', role: 'owner' })
    mockGetProject.mockResolvedValueOnce(avProject({ project: { createdBy: 'user-2' } }))

    const res = await handler({ body: { projectId, clipId: 'clip-still' } } as any)

    expect(res).toEqual({ id: 'src-1', status: 'approved' })
    expect(mockCreateSourceAsset).toHaveBeenCalled()
  })

  it('rejects invalid request bodies', async () => {
    await expect(handler({ body: { projectId: 'nope', clipId: 'clip-still' } } as any)).rejects.toMatchObject({ statusCode: 400 })
    await expect(handler({ body: { projectId, clipId: '' } } as any)).rejects.toMatchObject({ statusCode: 400 })
  })
})
