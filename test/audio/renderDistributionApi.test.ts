import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { params?: Record<string, string>; body?: any; context?: any }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.useRuntimeConfig = () => ({ public: { appUrl: 'https://app.xeroflow.io' } })

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args),
}))

const mockGetProjectWithCurrentTimeline = vi.fn()
const mockGetRenderJob = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...args: unknown[]) => mockGetProjectWithCurrentTimeline(...args),
  getRenderJob: (...args: unknown[]) => mockGetRenderJob(...args),
}))

const mockCreateVideoAsset = vi.fn()
vi.mock('~~/server/utils/video/assets', () => ({
  createVideoAsset: (...args: unknown[]) => mockCreateVideoAsset(...args),
}))

const mockCreateVideoReview = vi.fn()
vi.mock('~~/server/utils/video/reviews', () => ({
  createVideoReview: (...args: unknown[]) => mockCreateVideoReview(...args),
}))

const mockRenderPublicUrl = vi.fn()
vi.mock('~~/server/utils/audio/renderLinks', () => ({
  renderPublicUrl: (...args: unknown[]) => mockRenderPublicUrl(...args),
}))

const mockBuildVideoStudioSocialDraft = vi.fn()
vi.mock('~~/server/utils/socialVideoDraft', () => ({
  buildVideoStudioSocialDraft: (...args: unknown[]) => mockBuildVideoStudioSocialDraft(...args),
}))

const mockGenerateGroqInsight = vi.fn()
vi.mock('~~/server/utils/groqClient', () => ({
  GROQ_MODELS: {
    LLAMA_70B: 'llama-3.3-70b-versatile',
  },
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const mockQueryOne = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
}))

const saveAssetHandler = (await import('../../server/api/agency/audio/projects/[id]/renders/[jobId]/save-asset.post')).default
const sendToPortalHandler = (await import('../../server/api/agency/audio/projects/[id]/renders/[jobId]/send-to-portal.post')).default
const publishSocialHandler = (await import('../../server/api/agency/audio/projects/[id]/renders/[jobId]/publish-social.post')).default

const project = {
  project: {
    id: 'project-1',
    clientId: 'client-1',
    title: 'EOFY dealer launch',
  },
}

const job = {
  id: 'job-1',
  projectId: 'project-1',
  variants: {
    reels_9x16: 'media/project-1/job-1/reels_9x16.mp4',
  },
}

function event(body: Record<string, unknown> = { format: 'reels_9x16' }) {
  return {
    params: { id: 'project-1', jobId: 'job-1' },
    body,
    context: {},
  } as any
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_STUDIO_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
  mockGetProjectWithCurrentTimeline.mockResolvedValue(project)
  mockGetRenderJob.mockResolvedValue(job)
})

afterEach(() => {
  delete process.env.VIDEO_STUDIO_ENABLED
})

describe('render distribution endpoints', () => {
  it('saves a completed render variant to the video library with source provenance', async () => {
    mockCreateVideoAsset.mockResolvedValue({ id: 'asset-1' })

    const res = await saveAssetHandler(event({ format: 'reels_9x16', title: 'Launch render' }))

    expect(mockCreateVideoAsset).toHaveBeenCalledWith(expect.objectContaining({
      // The route passes the God-mode reserved id; staff requests get a fresh uuid.
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      clientId: 'client-1',
      createdBy: 'user-1',
      title: 'Launch render',
      sourceProjectId: 'project-1',
      sourceJobId: 'job-1',
      r2Key: 'media/project-1/job-1/reels_9x16.mp4',
      format: 'reels_9x16',
      width: 1080,
      height: 1920,
      durationSec: null,
    }))
    expect(res).toEqual({ asset: { id: 'asset-1' } })
  })

  it('creates a client portal video review for a completed render variant', async () => {
    mockCreateVideoReview.mockResolvedValue({ id: 'review-1' })

    const res = await sendToPortalHandler(event({ format: 'reels_9x16', title: 'Client review' }))

    expect(mockCreateVideoReview).toHaveBeenCalledWith({
      clientId: 'client-1',
      mediaProjectId: 'project-1',
      jobId: 'job-1',
      format: 'reels_9x16',
      r2Key: 'media/project-1/job-1/reels_9x16.mp4',
      title: 'Client review',
      createdBy: 'user-1',
    })
    expect(res).toEqual({ review: { id: 'review-1' } })
  })

  it('creates a social composer draft with a signed render URL and generated caption content', async () => {
    mockRenderPublicUrl.mockResolvedValue('https://app.xeroflow.io/api/public/renders/token')
    mockBuildVideoStudioSocialDraft.mockResolvedValue({
      content: 'Generated launch caption',
      mediaUrls: ['https://app.xeroflow.io/api/public/renders/token'],
      platforms: ['instagram', 'tiktok'],
      tags: ['video-studio', 'reels_9x16'],
      metadata: { source: 'video_studio', projectId: 'project-1', jobId: 'job-1', format: 'reels_9x16' },
    })
    mockQueryOne.mockResolvedValue({ id: 'post-1' })

    const res = await publishSocialHandler(event({ format: 'reels_9x16' }))

    expect(mockRenderPublicUrl).toHaveBeenCalledWith('job-1', 'reels_9x16', 'https://app.xeroflow.io')
    expect(mockBuildVideoStudioSocialDraft).toHaveBeenCalledWith(expect.objectContaining({
      clientId: 'client-1',
      createdBy: 'user-1',
      mediaUrl: 'https://app.xeroflow.io/api/public/renders/token',
      format: 'reels_9x16',
      projectId: 'project-1',
      jobId: 'job-1',
      prompt: 'EOFY dealer launch',
      captionGenerator: expect.any(Function),
    }))
    const captionGenerator = mockBuildVideoStudioSocialDraft.mock.calls[0][0].captionGenerator
    mockGenerateGroqInsight.mockResolvedValue('AI generated caption')
    await expect(captionGenerator({ topic: 'Launch brief', platform: 'instagram', tone: 'professional' }))
      .resolves.toBe('AI generated caption')
    expect(mockGenerateGroqInsight).toHaveBeenCalledWith(
      expect.stringContaining('Topic / brief: Launch brief'),
      expect.objectContaining({
        temperature: 0.7,
        maxTokens: 400,
        featureKey: 'audio_render_publish_social_caption',
        userId: 'user-1',
        clientId: 'client-1',
        requestId: 'job-1',
        metadata: {
          route: '/api/agency/audio/projects/:id/renders/:jobId/publish-social',
          projectId: 'project-1',
          jobId: 'job-1',
          format: 'reels_9x16',
          platform: 'instagram',
          tone: 'professional',
        },
        systemPrompt: expect.stringContaining('social media copywriter'),
      })
    )
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO social_posts'),
      [
        'client-1',
        'user-1',
        'Generated launch caption',
        ['https://app.xeroflow.io/api/public/renders/token'],
        ['instagram', 'tiktok'],
        ['video-studio', 'reels_9x16'],
        JSON.stringify({ source: 'video_studio', projectId: 'project-1', jobId: 'job-1', format: 'reels_9x16' }),
      ]
    )
    expect(res).toEqual({ postId: 'post-1', clientId: 'client-1' })
  })

  it('rejects portal and social distribution when the project has no client', async () => {
    mockGetProjectWithCurrentTimeline.mockResolvedValue({ project: { id: 'project-1', clientId: null } })

    await expect(sendToPortalHandler(event())).rejects.toMatchObject({ statusCode: 400 })
    await expect(publishSocialHandler(event())).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateVideoReview).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rejects distribution when the requested render variant is missing', async () => {
    mockGetRenderJob.mockResolvedValue({ ...job, variants: {} })

    await expect(saveAssetHandler(event())).rejects.toMatchObject({ statusCode: 404 })
    await expect(sendToPortalHandler(event())).rejects.toMatchObject({ statusCode: 404 })
    await expect(publishSocialHandler(event())).rejects.toMatchObject({ statusCode: 404 })
  })
})
