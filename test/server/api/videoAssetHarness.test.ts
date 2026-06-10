import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent { params?: Record<string, string>; body?: any; query?: Record<string, any> }
const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (event: TestEvent, name: string) => event.params?.[name]
g.getQuery = (event: TestEvent) => event.query ?? {}
g.readBody = async (event: TestEvent) => event.body ?? {}
g.readMultipartFormData = vi.fn()
g.createError = (input: any) => Object.assign(new Error(input.statusMessage), input)
g.setResponseStatus = vi.fn()
g.sendRedirect = vi.fn((_event: TestEvent, location: string, statusCode: number) => ({ location, statusCode }))
g.useRuntimeConfig = () => ({ public: { appUrl: 'https://app.example.test' } })

const mockRequireWriteAccess = vi.fn()
const mockRequireAuth = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
}))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...args: unknown[]) => mockGetProject(...args)
}))

const mockUploadFile = vi.fn()
const mockGetPresignedDownloadUrl = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockIsStorageConfigured = vi.fn()
vi.mock('~~/server/utils/storage', () => ({
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
}))

const mockVideoAssetPublicUrl = vi.fn()
vi.mock('~~/server/utils/video/assetLinks', () => ({
  videoAssetPublicUrl: (...args: unknown[]) => mockVideoAssetPublicUrl(...args),
}))

const mockBuildVideoStudioSocialDraft = vi.fn()
vi.mock('~~/server/utils/socialVideoDraft', () => ({
  buildVideoStudioSocialDraft: (...args: unknown[]) => mockBuildVideoStudioSocialDraft(...args),
}))

const mockGenerateGroqInsight = vi.fn()
vi.mock('~~/server/utils/groqClient', () => ({
  generateGroqInsight: (...args: unknown[]) => mockGenerateGroqInsight(...args),
}))

const mockEnsureBuckets = vi.fn()
const mockSyncGeneratedAssets = vi.fn()
const mockListBuckets = vi.fn()
const mockListBucketItems = vi.fn()
const mockCreateOrUpdateDirective = vi.fn()
const mockCreateBlockedExtractionJob = vi.fn()
const mockCreateQueuedExtractionJob = vi.fn()
const mockMarkAssetIntelligenceJobFailed = vi.fn()
const mockListProjectIntelligenceJobs = vi.fn()
const mockListDerivatives = vi.fn()
const mockGetDerivative = vi.fn()
const mockAddDerivativeToProjectBucket = vi.fn()
const mockGetAssetProjectRelationship = vi.fn()
const mockGetBucketItemProjectRelationship = vi.fn()
vi.mock('~~/server/utils/video-asset-intelligence/db', () => ({
  ensureDefaultBuckets: (...args: unknown[]) => mockEnsureBuckets(...args),
  syncProjectVideoAssetsIntoGeneratedBucket: (...args: unknown[]) => mockSyncGeneratedAssets(...args),
  listProjectBuckets: (...args: unknown[]) => mockListBuckets(...args),
  listBucketItemsForProject: (...args: unknown[]) => mockListBucketItems(...args),
  createOrUpdateBucketItemDirective: (...args: unknown[]) => mockCreateOrUpdateDirective(...args),
  createBlockedExtractionJob: (...args: unknown[]) => mockCreateBlockedExtractionJob(...args),
  createQueuedExtractionJob: (...args: unknown[]) => mockCreateQueuedExtractionJob(...args),
  markAssetIntelligenceJobFailed: (...args: unknown[]) => mockMarkAssetIntelligenceJobFailed(...args),
  listProjectIntelligenceJobs: (...args: unknown[]) => mockListProjectIntelligenceJobs(...args),
  listAssetDerivatives: (...args: unknown[]) => mockListDerivatives(...args),
  getAssetDerivative: (...args: unknown[]) => mockGetDerivative(...args),
  addDerivativeToProjectBucket: (...args: unknown[]) => mockAddDerivativeToProjectBucket(...args),
  getAssetProjectRelationship: (...args: unknown[]) => mockGetAssetProjectRelationship(...args),
  getBucketItemProjectRelationship: (...args: unknown[]) => mockGetBucketItemProjectRelationship(...args),
}))

const mockEnqueueAssetIntelligence = vi.fn()
const mockGetAssetIntelligenceQueue = vi.fn()
vi.mock('~~/server/utils/video-asset-intelligence/enqueue', () => ({
  getAssetIntelligenceQueue: (...args: unknown[]) => mockGetAssetIntelligenceQueue(...args),
  enqueueAssetIntelligence: (...args: unknown[]) => mockEnqueueAssetIntelligence(...args),
}))

const bucketsHandler = (await import('~~/server/api/agency/video/projects/[id]/buckets/index.get')).default
const directiveHandler = (await import('~~/server/api/agency/video/bucket-items/[id]/directive.post')).default
const extractHandler = (await import('~~/server/api/agency/video/assets/[id]/extract.post')).default
const listAssetsHandler = (await import('~~/server/api/agency/video/assets/index.get')).default
const assetStreamHandler = (await import('~~/server/api/agency/video/assets/[id]/stream.get')).default
const publishSocialHandler = (await import('~~/server/api/agency/video/assets/[id]/publish-social.post')).default
const maskHandler = (await import('~~/server/api/agency/video/assets/[id]/masks.post')).default
const derivativesHandler = (await import('~~/server/api/agency/video/assets/[id]/derivatives.get')).default
const addDerivativeToBucketHandler = (await import('~~/server/api/agency/video/derivatives/[id]/add-to-bucket.post')).default
const derivativeStreamHandler = (await import('~~/server/api/agency/video/derivatives/[id]/stream.get')).default
const assembleHandler = (await import('~~/server/api/agency/video/projects/[id]/assemble.post')).default
const jobsHandler = (await import('~~/server/api/agency/video/projects/[id]/intelligence-jobs.get')).default
const thumbnailHandler = (await import('~~/server/api/agency/video/assets/[id]/thumbnail.get')).default
const captionsHandler = (await import('~~/server/api/agency/video/assets/[id]/captions.vtt.get')).default

describe('video asset harness API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.VIDEO_STUDIO_ENABLED = 'true'
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'owner' })
    mockRequireAuth.mockResolvedValue({ id: 'user-1', role: 'owner' })
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'av', createdBy: 'user-1' }, timeline: { id: 't1' } })
    mockEnsureBuckets.mockResolvedValue(undefined)
    mockSyncGeneratedAssets.mockResolvedValue(undefined)
    mockListBuckets.mockResolvedValue([{ id: 'b1', projectId: 'p1', kind: 'footage', name: 'Footage', sortOrder: 10, createdAt: 'now', updatedAt: 'now' }])
    mockListBucketItems.mockResolvedValue([{ id: 'i1', bucketId: 'b1', assetId: 'a1', r2Key: 'car.mp4', title: 'Car', role: 'hero', directive: {}, status: 'ready', createdAt: 'now', updatedAt: 'now' }])
    mockCreateOrUpdateDirective.mockResolvedValue({ id: 'i1', directive: { prompt: 'lift logo' } })
    mockCreateBlockedExtractionJob.mockResolvedValue({ id: 'j1', status: 'blocked', action: 'mask-lift' })
    mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'mask-only' })
    mockMarkAssetIntelligenceJobFailed.mockResolvedValue({ id: 'job-queued', status: 'failed', action: 'mask-only', errorMessage: 'Queue offline' })
    mockGetAssetIntelligenceQueue.mockReturnValue(null)
    mockEnqueueAssetIntelligence.mockResolvedValue(undefined)
    mockListProjectIntelligenceJobs.mockResolvedValue([{ id: 'j1', action: 'mask-lift', status: 'blocked' }])
    mockListDerivatives.mockResolvedValue([{ id: 'd1', kind: 'foreground-png' }])
    mockGetAssetProjectRelationship.mockResolvedValue({
      assetId: '22222222-2222-4222-8222-222222222222',
      projectId: '11111111-1111-4111-8111-111111111111',
    })
    mockGetBucketItemProjectRelationship.mockResolvedValue({
      bucketItemId: '33333333-3333-4333-8333-333333333333',
      projectId: '11111111-1111-4111-8111-111111111111',
    })
    mockGetDerivative.mockResolvedValue({
      id: 'd1',
      sourceAssetId: 'a1',
      projectId: '11111111-1111-4111-8111-111111111111',
      kind: 'foreground-png',
      r2Key: 'video-asset-derivatives/p1/a1/foreground.png',
      width: 1080,
      height: 1080,
      metadata: { prompt: 'lift logo' },
      createdAt: 'now',
    })
    mockAddDerivativeToProjectBucket.mockResolvedValue({
      id: 'item-derivative',
      bucketId: 'bucket-generated',
      assetId: null,
      r2Key: 'video-asset-derivatives/p1/a1/foreground.png',
      title: 'Lifted logo',
      role: 'hero-overlay',
      directive: { prompt: 'place top right' },
      status: 'ready',
      createdAt: 'now',
      updatedAt: 'now',
    })
    mockUploadFile.mockResolvedValue({ key: 'video-asset-masks/p1/a1/mask.png', url: '/api/_uploads/video-asset-masks/p1/a1/mask.png', size: 4 })
    mockGetPresignedDownloadUrl.mockResolvedValue('/signed-mask-url')
    mockGetPublicUrl.mockReturnValue(null)
    mockIsStorageConfigured.mockReturnValue(false)
    mockVideoAssetPublicUrl.mockResolvedValue('https://app.example.test/api/public/video-assets/token')
    mockBuildVideoStudioSocialDraft.mockResolvedValue({
      content: 'Draft caption',
      mediaUrls: ['https://app.example.test/api/public/video-assets/token'],
      platforms: ['instagram'],
      tags: ['video-studio', 'mp4'],
      metadata: { source: 'video_studio' },
    })
    mockGenerateGroqInsight.mockResolvedValue('Draft caption')
    mockQueryRows.mockResolvedValue([{
      id: '22222222-2222-4222-8222-222222222222',
      client_id: null,
      created_by: 'user-1',
      title: 'Asset',
      source_project_id: '11111111-1111-4111-8111-111111111111',
      source_job_id: null,
      r2_key: 'asset.mp4',
      format: 'mp4',
      width: 1920,
      height: 1080,
      duration_sec: 12,
      thumbnail_key: 'thumbs/asset.jpg',
      caption_vtt_key: 'captions/asset.vtt',
      transcript: null,
      metadata: {},
      created_at: 'now',
      updated_at: 'now',
    }])
    mockQueryOne.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      client_id: null,
      created_by: 'user-1',
      title: 'Asset',
      source_project_id: '11111111-1111-4111-8111-111111111111',
      source_job_id: null,
      r2_key: 'asset.mp4',
      format: 'mp4',
      width: 1920,
      height: 1080,
      duration_sec: 12,
      thumbnail_key: 'thumbs/asset.jpg',
      caption_vtt_key: 'captions/asset.vtt',
      transcript: null,
      metadata: {},
      created_at: 'now',
      updated_at: 'now',
    })
    g.readMultipartFormData.mockResolvedValue([])
  })

  it('ensures default buckets before listing project buckets', async () => {
    const res = await bucketsHandler({ params: { id: '11111111-1111-4111-8111-111111111111' } } as any)
    expect(mockEnsureBuckets).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockSyncGeneratedAssets).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(res.buckets).toHaveLength(1)
    expect(res.items).toHaveLength(1)
  })

  it('rejects bucket listing when a writable user cannot mutate the project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    await expect(bucketsHandler({ params: { id: '11111111-1111-4111-8111-111111111111' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockEnsureBuckets).not.toHaveBeenCalled()
    expect(mockListBuckets).not.toHaveBeenCalled()
  })

  it('updates an item directive for agentic assembly', async () => {
    const res = await directiveHandler({ params: { id: '33333333-3333-4333-8333-333333333333' }, body: { role: 'hero', directive: { prompt: 'lift logo' } } } as any)
    expect(mockGetBucketItemProjectRelationship).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333')
    expect(mockCreateOrUpdateDirective).toHaveBeenCalledWith('33333333-3333-4333-8333-333333333333', { role: 'hero', directive: { prompt: 'lift logo' } })
    expect(res.item.id).toBe('i1')
  })

  it('rejects directive updates when the bucket item belongs to another project', async () => {
    mockGetBucketItemProjectRelationship.mockResolvedValue({
      bucketItemId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
    })
    mockGetProject.mockResolvedValue({ project: { id: '44444444-4444-4444-8444-444444444444', mediaType: 'av', createdBy: 'user-2' }, timeline: { id: 't2' } })
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })

    await expect(directiveHandler({ params: { id: '33333333-3333-4333-8333-333333333333' }, body: { role: 'hero', directive: { prompt: 'lift logo' } } } as any))
      .rejects
      .toMatchObject({ statusCode: 403 })

    expect(mockCreateOrUpdateDirective).not.toHaveBeenCalled()
  })

  it('creates a blocked mask-lift job when extraction provider execution is not configured', async () => {
    const res = await extractHandler({ params: { id: '22222222-2222-4222-8222-222222222222' }, body: { projectId: '11111111-1111-4111-8111-111111111111', action: 'mask-lift', prompt: 'lift embedded logo', brushMaskKey: 'mask.png' } } as any)
    expect(mockGetProject).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockGetAssetProjectRelationship).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
    expect(mockCreateBlockedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      action: 'mask-lift',
      prompt: 'lift embedded logo',
      brushMaskKey: 'mask.png',
      createdBy: 'user-1'
    }))
    expect(res.job.status).toBe('blocked')
  })

  it('creates blocked jobs for unsupported actions even when queue binding exists', async () => {
    mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
    mockCreateBlockedExtractionJob.mockResolvedValue({ id: 'job-blocked', status: 'blocked', action: 'erase-fill', errorMessage: 'Asset intelligence action erase-fill is not supported by the deployed worker.' })

    const res = await extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        action: 'erase-fill',
        prompt: 'erase badge',
        brushMaskKey: 'mask.png',
      }
    } as any)

    expect(mockCreateBlockedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      action: 'erase-fill',
      createdBy: 'user-1',
      errorMessage: 'Asset intelligence action erase-fill is not supported by the deployed worker.',
    }))
    expect(mockCreateQueuedExtractionJob).not.toHaveBeenCalled()
    expect(mockEnqueueAssetIntelligence).not.toHaveBeenCalled()
    expect(res.job.status).toBe('blocked')
  })

  it('creates and enqueues executable asset intelligence jobs when queue binding exists', async () => {
    mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
    mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'mask-only' })

    const res = await extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        action: 'mask-only',
        prompt: 'store mask',
        brushMaskKey: 'mask.png',
      }
    } as any)

    expect(mockCreateQueuedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      action: 'mask-only',
      createdBy: 'user-1',
    }))
    expect(mockEnqueueAssetIntelligence).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'job-queued',
      projectId: '11111111-1111-4111-8111-111111111111',
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
    })
    expect(res.job.status).toBe('queued')
  })

  it('blocks queued asset intelligence when caller supplies an unsupported explicit model', async () => {
    mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
    mockCreateBlockedExtractionJob.mockResolvedValue({
      id: 'job-blocked',
      status: 'blocked',
      action: 'asset-analysis',
      errorMessage: 'Asset intelligence action asset-analysis with model workers-ai/other-model is not supported by the deployed worker.',
    })

    const res = await extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        action: 'asset-analysis',
        modelId: 'workers-ai/other-model',
      },
    } as any)

    expect(mockCreateBlockedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      action: 'asset-analysis',
      modelId: 'workers-ai/other-model',
      createdBy: 'user-1',
      errorMessage: 'Asset intelligence action asset-analysis with model workers-ai/other-model is not supported by the deployed worker.',
    }))
    expect(mockCreateQueuedExtractionJob).not.toHaveBeenCalled()
    expect(mockEnqueueAssetIntelligence).not.toHaveBeenCalled()
    expect(res.job.status).toBe('blocked')
  })

  it('marks queued asset intelligence jobs failed when enqueue rejects', async () => {
    mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
    mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'mask-only' })
    mockEnqueueAssetIntelligence.mockRejectedValue(new Error('Queue offline'))

    await expect(extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        action: 'mask-only',
        prompt: 'store mask',
        brushMaskKey: 'mask.png',
      }
    } as any)).rejects.toThrow('Queue offline')

    expect(mockMarkAssetIntelligenceJobFailed).toHaveBeenCalledWith('job-queued', 'Queue offline')
  })

  it('rejects extraction when the caller cannot mutate the project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    await expect(extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: { projectId: '11111111-1111-4111-8111-111111111111', action: 'mask-only', brushMaskKey: 'mask.png' },
    } as any)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockGetAssetProjectRelationship).not.toHaveBeenCalled()
    expect(mockCreateQueuedExtractionJob).not.toHaveBeenCalled()
    expect(mockCreateBlockedExtractionJob).not.toHaveBeenCalled()
  })

  it('rejects extraction when the source asset belongs to another project', async () => {
    mockGetAssetProjectRelationship.mockResolvedValue({
      assetId: '22222222-2222-4222-8222-222222222222',
      projectId: '44444444-4444-4444-8444-444444444444',
    })

    await expect(extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: { projectId: '11111111-1111-4111-8111-111111111111', action: 'mask-only', brushMaskKey: 'mask.png' },
    } as any)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Source asset does not belong to this project' })

    expect(mockCreateQueuedExtractionJob).not.toHaveBeenCalled()
    expect(mockCreateBlockedExtractionJob).not.toHaveBeenCalled()
  })

  it('lists only saved video assets accessible to a non-owner editor', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    const res = await listAssetsHandler({
      query: {
        clientId: '55555555-5555-4555-8555-555555555555',
        limit: '25',
      },
    } as any)

    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.stringContaining('(va.created_by = $1 OR mp.created_by = $1)'),
      ['user-2', '55555555-5555-4555-8555-555555555555', 25],
    )
    expect(res.assets).toHaveLength(1)
  })

  it('preserves all-assets saved video listing for admins', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'admin-1', role: 'admin' })

    await listAssetsHandler({ query: { limit: '25' } } as any)

    expect(mockQueryRows).toHaveBeenCalledWith(
      expect.not.stringContaining('mp.created_by'),
      [25],
    )
  })

  it('rejects saved video asset streams when the editor cannot access the asset', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })
    mockQueryOne.mockResolvedValue(null)

    await expect(assetStreamHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any))
      .rejects
      .toMatchObject({ statusCode: 404, statusMessage: 'Asset not found' })

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('(va.created_by = $2 OR mp.created_by = $2)'),
      ['22222222-2222-4222-8222-222222222222', 'user-2'],
    )
    expect(g.sendRedirect).not.toHaveBeenCalled()
  })

  it('streams saved video assets created by the editor', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1', role: 'editor' })
    mockIsStorageConfigured.mockReturnValue(true)
    mockGetPresignedDownloadUrl.mockResolvedValue('https://signed.example.com/asset.mp4')

    const res = await assetStreamHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any)

    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith('asset.mp4', 3600)
    expect(res).toEqual({ location: 'https://signed.example.com/asset.mp4', statusCode: 302 })
  })

  it('rejects social draft publishing when the editor cannot access the saved asset', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })
    mockQueryOne.mockResolvedValue(null)

    await expect(publishSocialHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any))
      .rejects
      .toMatchObject({ statusCode: 404, statusMessage: 'Asset not found' })

    expect(mockBuildVideoStudioSocialDraft).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO social_posts'), expect.anything())
  })

  it('creates a social draft for accessible saved video assets', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: '22222222-2222-4222-8222-222222222222',
      client_id: '55555555-5555-4555-8555-555555555555',
      created_by: 'user-1',
      title: 'Asset',
      source_project_id: '11111111-1111-4111-8111-111111111111',
      source_job_id: null,
      r2_key: 'asset.mp4',
      format: 'mp4',
      width: 1920,
      height: 1080,
      duration_sec: 12,
      thumbnail_key: null,
      caption_vtt_key: null,
      transcript: null,
      metadata: {},
      generation_prompt: 'Drive away',
      generation_model_id: 'aigateway/seedance-i2v',
      created_at: 'now',
      updated_at: 'now',
    })
    mockQueryOne.mockResolvedValueOnce({ id: 'post-1' })

    const res = await publishSocialHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any)

    expect(mockBuildVideoStudioSocialDraft).toHaveBeenCalledWith(expect.objectContaining({
      clientId: '55555555-5555-4555-8555-555555555555',
      createdBy: 'user-1',
      assetId: '22222222-2222-4222-8222-222222222222',
      prompt: 'Drive away',
      modelId: 'aigateway/seedance-i2v',
    }))
    expect(mockQueryOne).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO social_posts'), expect.any(Array))
    expect(res).toEqual({ postId: 'post-1', clientId: '55555555-5555-4555-8555-555555555555' })
  })

  it('rejects extraction when the bucket item belongs to another project', async () => {
    mockGetBucketItemProjectRelationship.mockResolvedValue({
      bucketItemId: '33333333-3333-4333-8333-333333333333',
      projectId: '44444444-4444-4444-8444-444444444444',
    })

    await expect(extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        bucketItemId: '33333333-3333-4333-8333-333333333333',
        action: 'mask-only',
        brushMaskKey: 'mask.png',
      },
    } as any)).rejects.toMatchObject({ statusCode: 403, statusMessage: 'Bucket item does not belong to this project' })

    expect(mockCreateQueuedExtractionJob).not.toHaveBeenCalled()
    expect(mockCreateBlockedExtractionJob).not.toHaveBeenCalled()
  })

  it('uploads a brush mask for a selected asset', async () => {
    g.readMultipartFormData.mockResolvedValue([
      { name: 'projectId', data: Buffer.from('11111111-1111-4111-8111-111111111111') },
      { name: 'file', filename: 'mask.png', type: 'image/png', data: Buffer.from([1, 2, 3, 4]) },
    ])

    const res = await maskHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any)

    expect(mockGetProject).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockUploadFile).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3, 4]),
      expect.stringMatching(/^video-asset-masks\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\/\d+-[a-f0-9-]+\.png$/),
      'image/png',
      expect.objectContaining({
        projectId: '11111111-1111-4111-8111-111111111111',
        sourceAssetId: '22222222-2222-4222-8222-222222222222',
        kind: 'brush-mask',
      })
    )
    expect(res).toMatchObject({
      maskKey: expect.stringContaining('video-asset-masks/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/'),
      url: '/api/_uploads/video-asset-masks/p1/a1/mask.png',
      size: 4,
    })
  })

  it('rejects mask uploads when a writable user cannot mutate the project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })
    g.readMultipartFormData.mockResolvedValue([
      { name: 'projectId', data: Buffer.from('11111111-1111-4111-8111-111111111111') },
      { name: 'file', filename: 'mask.png', type: 'image/png', data: Buffer.from([1, 2, 3, 4]) },
    ])

    await expect(maskHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  it('rejects mask uploads when the source asset belongs to another project', async () => {
    mockGetAssetProjectRelationship.mockResolvedValue({
      assetId: '22222222-2222-4222-8222-222222222222',
      projectId: '44444444-4444-4444-8444-444444444444',
    })
    g.readMultipartFormData.mockResolvedValue([
      { name: 'projectId', data: Buffer.from('11111111-1111-4111-8111-111111111111') },
      { name: 'file', filename: 'mask.png', type: 'image/png', data: Buffer.from([1, 2, 3, 4]) },
    ])

    await expect(maskHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Source asset does not belong to this project' })

    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  it('lists derivatives for an asset', async () => {
    const res = await derivativesHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any)
    expect(mockGetAssetProjectRelationship).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
    expect(mockListDerivatives).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
    expect(res.derivatives[0].kind).toBe('foreground-png')
  })

  it('rejects derivative listing when a writable user cannot mutate the asset project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    await expect(derivativesHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockListDerivatives).not.toHaveBeenCalled()
  })

  it('404s derivative stream requests when the derivative is missing', async () => {
    mockGetDerivative.mockResolvedValue(null)

    await expect(derivativeStreamHandler({ params: { id: 'missing-derivative' } } as any))
      .rejects
      .toMatchObject({ statusCode: 404 })
  })

  it('redirects derivative stream requests to the derivative media URL', async () => {
    mockIsStorageConfigured.mockReturnValue(true)
    mockGetPublicUrl.mockReturnValue(null)
    mockGetPresignedDownloadUrl.mockResolvedValue('https://signed.example.com/derivative.png')

    const res = await derivativeStreamHandler({ params: { id: 'd1' } } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'd1' } }))
    expect(mockGetDerivative).toHaveBeenCalledWith('d1')
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith('video-asset-derivatives/p1/a1/foreground.png', 3600)
    expect(res).toEqual({ location: 'https://signed.example.com/derivative.png', statusCode: 302 })
  })

  it('rejects derivative stream requests when the derivative is not attached to a project', async () => {
    mockGetDerivative.mockResolvedValue({ id: 'd-projectless', projectId: null })

    await expect(derivativeStreamHandler({ params: { id: 'd-projectless' } } as any))
      .rejects
      .toMatchObject({ statusCode: 400 })

    expect(g.sendRedirect).not.toHaveBeenCalled()
  })

  it('rejects derivative stream requests when a writable user cannot access the derivative project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'av', createdBy: 'user-1' }, timeline: { id: 't1' } })

    await expect(derivativeStreamHandler({ params: { id: 'd1' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(g.sendRedirect).not.toHaveBeenCalled()
  })

  it('allows admins to stream derivatives from projects they did not create', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'av', createdBy: 'user-1' }, timeline: { id: 't1' } })

    const res = await derivativeStreamHandler({ params: { id: 'd1' } } as any)

    expect(res).toEqual({ location: '/api/_uploads/video-asset-derivatives/p1/a1/foreground.png', statusCode: 302 })
  })

  it('adds a derivative to the requested project bucket', async () => {
    const directive = { prompt: 'place top right' }
    const res = await addDerivativeToBucketHandler({
      params: { id: 'd1' },
      body: {
        bucketKind: 'graphics',
        role: 'hero-overlay',
        title: 'Lifted logo',
        directive,
      },
    } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalledWith(expect.objectContaining({ params: { id: 'd1' } }))
    expect(mockGetDerivative).toHaveBeenCalledWith('d1')
    expect(mockGetProject).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockAddDerivativeToProjectBucket).toHaveBeenCalledWith({
      derivative: expect.objectContaining({ id: 'd1', projectId: '11111111-1111-4111-8111-111111111111' }),
      bucketKind: 'graphics',
      role: 'hero-overlay',
      title: 'Lifted logo',
      directive,
    })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 201)
    expect(res).toEqual({
      item: expect.objectContaining({ id: 'item-derivative', assetId: null }),
      derivative: expect.objectContaining({ id: 'd1' }),
    })
  })

  it('rejects add-to-bucket when the derivative is missing', async () => {
    mockGetDerivative.mockResolvedValue(null)

    await expect(addDerivativeToBucketHandler({ params: { id: 'missing-derivative' }, body: {} } as any))
      .rejects
      .toMatchObject({ statusCode: 404 })
  })

  it('rejects add-to-bucket when the derivative is not attached to a project', async () => {
    mockGetDerivative.mockResolvedValue({ id: 'd-projectless', projectId: null })

    await expect(addDerivativeToBucketHandler({ params: { id: 'd-projectless' }, body: {} } as any))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(mockGetProject).not.toHaveBeenCalled()
    expect(mockAddDerivativeToProjectBucket).not.toHaveBeenCalled()
  })

  it('rejects add-to-bucket when the derivative project is missing', async () => {
    mockGetProject.mockResolvedValue(null)

    await expect(addDerivativeToBucketHandler({ params: { id: 'd1' }, body: {} } as any))
      .rejects
      .toMatchObject({ statusCode: 404 })
    expect(mockAddDerivativeToProjectBucket).not.toHaveBeenCalled()
  })

  it('rejects add-to-bucket for non-AV projects', async () => {
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'audio', createdBy: 'user-1' }, timeline: { id: 't1' } })

    await expect(addDerivativeToBucketHandler({ params: { id: 'd1' }, body: {} } as any))
      .rejects
      .toMatchObject({ statusCode: 400 })
    expect(mockAddDerivativeToProjectBucket).not.toHaveBeenCalled()
  })

  it('rejects add-to-bucket when a writable user cannot mutate the derivative project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'av', createdBy: 'user-1' }, timeline: { id: 't1' } })

    await expect(addDerivativeToBucketHandler({ params: { id: 'd1' }, body: {} } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })
    expect(mockAddDerivativeToProjectBucket).not.toHaveBeenCalled()
  })

  it('allows admins to add derivatives to projects they did not create', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'admin-1', role: 'admin' })
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'av', createdBy: 'user-1' }, timeline: { id: 't1' } })

    const res = await addDerivativeToBucketHandler({ params: { id: 'd1' }, body: {} } as any)

    expect(res.item.id).toBe('item-derivative')
    expect(mockAddDerivativeToProjectBucket).toHaveBeenCalled()
  })

  it('rejects add-to-bucket before lookup when bucket kind is invalid', async () => {
    await expect(addDerivativeToBucketHandler({ params: { id: 'd1' }, body: { bucketKind: 'not-a-bucket' } } as any))
      .rejects
      .toThrow()
    expect(mockGetDerivative).not.toHaveBeenCalled()
    expect(mockAddDerivativeToProjectBucket).not.toHaveBeenCalled()
  })

  it('lists project intelligence jobs for the producer activity panel', async () => {
    const res = await jobsHandler({ params: { id: '11111111-1111-4111-8111-111111111111' }, query: { limit: '20' } } as any)
    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockGetProject).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockListProjectIntelligenceJobs).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 20)
    expect(res.jobs).toEqual([{ id: 'j1', action: 'mask-lift', status: 'blocked' }])
  })

  it('rejects project intelligence jobs when a writable user cannot mutate the project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    await expect(jobsHandler({ params: { id: '11111111-1111-4111-8111-111111111111' }, query: { limit: '20' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockListProjectIntelligenceJobs).not.toHaveBeenCalled()
  })

  it('returns a reviewable assemble plan instead of mutating the timeline', async () => {
    const res = await assembleHandler({ params: { id: '11111111-1111-4111-8111-111111111111' }, body: { brief: 'Create a TikTok edit', targetFormat: 'tiktok_9x16' } } as any)
    expect(res.plan).toMatchObject({ projectId: '11111111-1111-4111-8111-111111111111', status: 'draft', brief: 'Create a TikTok edit' })
    expect(res.plan.steps[0]).toMatchObject({ type: 'place-asset', assetId: 'a1' })
  })

  it('rejects assemble when a writable user cannot mutate the project', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    await expect(assembleHandler({ params: { id: '11111111-1111-4111-8111-111111111111' }, body: { brief: 'Create a TikTok edit' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockListBucketItems).not.toHaveBeenCalled()
  })

  it('redirects asset thumbnails only after project access is verified', async () => {
    mockIsStorageConfigured.mockReturnValue(true)
    mockGetPresignedDownloadUrl.mockResolvedValue('https://signed.example.com/thumb.jpg')

    const res = await thumbnailHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockGetAssetProjectRelationship).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222')
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith('thumbs/asset.jpg', 3600)
    expect(res).toEqual({ location: 'https://signed.example.com/thumb.jpg', statusCode: 302 })
  })

  it('rejects captions when the asset project is not accessible', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-2', role: 'editor' })

    await expect(captionsHandler({ params: { id: '22222222-2222-4222-8222-222222222222' } } as any))
      .rejects
      .toMatchObject({ statusCode: 403, statusMessage: 'Access denied to this project' })

    expect(mockQueryOne).not.toHaveBeenCalled()
    expect(g.sendRedirect).not.toHaveBeenCalled()
  })
})
