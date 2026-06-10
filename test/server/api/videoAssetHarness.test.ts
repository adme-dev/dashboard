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

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
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
const maskHandler = (await import('~~/server/api/agency/video/assets/[id]/masks.post')).default
const derivativesHandler = (await import('~~/server/api/agency/video/assets/[id]/derivatives.get')).default
const assembleHandler = (await import('~~/server/api/agency/video/projects/[id]/assemble.post')).default
const jobsHandler = (await import('~~/server/api/agency/video/projects/[id]/intelligence-jobs.get')).default

describe('video asset harness API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'user-1' })
    mockGetProject.mockResolvedValue({ project: { id: '11111111-1111-4111-8111-111111111111', mediaType: 'av' }, timeline: { id: 't1' } })
    mockEnsureBuckets.mockResolvedValue(undefined)
    mockSyncGeneratedAssets.mockResolvedValue(undefined)
    mockListBuckets.mockResolvedValue([{ id: 'b1', projectId: 'p1', kind: 'footage', name: 'Footage', sortOrder: 10, createdAt: 'now', updatedAt: 'now' }])
    mockListBucketItems.mockResolvedValue([{ id: 'i1', bucketId: 'b1', assetId: 'a1', r2Key: 'car.mp4', title: 'Car', role: 'hero', directive: {}, status: 'ready', createdAt: 'now', updatedAt: 'now' }])
    mockCreateOrUpdateDirective.mockResolvedValue({ id: 'i1', directive: { prompt: 'lift logo' } })
    mockCreateBlockedExtractionJob.mockResolvedValue({ id: 'j1', status: 'blocked', action: 'mask-lift' })
    mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'erase-fill' })
    mockMarkAssetIntelligenceJobFailed.mockResolvedValue({ id: 'job-queued', status: 'failed', action: 'erase-fill', errorMessage: 'Queue offline' })
    mockGetAssetIntelligenceQueue.mockReturnValue(null)
    mockEnqueueAssetIntelligence.mockResolvedValue(undefined)
    mockListProjectIntelligenceJobs.mockResolvedValue([{ id: 'j1', action: 'mask-lift', status: 'blocked' }])
    mockListDerivatives.mockResolvedValue([{ id: 'd1', kind: 'foreground-png' }])
    mockUploadFile.mockResolvedValue({ key: 'video-asset-masks/p1/a1/mask.png', url: '/api/_uploads/video-asset-masks/p1/a1/mask.png', size: 4 })
    mockGetPresignedDownloadUrl.mockResolvedValue('/signed-mask-url')
    mockGetPublicUrl.mockReturnValue(null)
    mockIsStorageConfigured.mockReturnValue(false)
    g.readMultipartFormData.mockResolvedValue([])
  })

  it('ensures default buckets before listing project buckets', async () => {
    const res = await bucketsHandler({ params: { id: '11111111-1111-4111-8111-111111111111' } } as any)
    expect(mockEnsureBuckets).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockSyncGeneratedAssets).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(res.buckets).toHaveLength(1)
    expect(res.items).toHaveLength(1)
  })

  it('updates an item directive for agentic assembly', async () => {
    const res = await directiveHandler({ params: { id: 'i1' }, body: { role: 'hero', directive: { prompt: 'lift logo' } } } as any)
    expect(mockCreateOrUpdateDirective).toHaveBeenCalledWith('i1', { role: 'hero', directive: { prompt: 'lift logo' } })
    expect(res.item.id).toBe('i1')
  })

  it('creates a blocked mask-lift job when extraction provider execution is not configured', async () => {
    const res = await extractHandler({ params: { id: '22222222-2222-4222-8222-222222222222' }, body: { projectId: '11111111-1111-4111-8111-111111111111', action: 'mask-lift', prompt: 'lift embedded logo', brushMaskKey: 'mask.png' } } as any)
    expect(mockCreateBlockedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      action: 'mask-lift',
      prompt: 'lift embedded logo',
      brushMaskKey: 'mask.png',
      createdBy: 'user-1'
    }))
    expect(res.job.status).toBe('blocked')
  })

  it('creates and enqueues executable asset intelligence jobs when queue binding exists', async () => {
    mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
    mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'erase-fill' })

    const res = await extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        action: 'erase-fill',
        prompt: 'erase badge',
        brushMaskKey: 'mask.png',
      }
    } as any)

    expect(mockCreateQueuedExtractionJob).toHaveBeenCalledWith(expect.objectContaining({
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
      action: 'erase-fill',
      createdBy: 'user-1',
    }))
    expect(mockEnqueueAssetIntelligence).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'job-queued',
      projectId: '11111111-1111-4111-8111-111111111111',
      sourceAssetId: '22222222-2222-4222-8222-222222222222',
    })
    expect(res.job.status).toBe('queued')
  })

  it('marks queued asset intelligence jobs failed when enqueue rejects', async () => {
    mockGetAssetIntelligenceQueue.mockReturnValue({ send: vi.fn() })
    mockCreateQueuedExtractionJob.mockResolvedValue({ id: 'job-queued', status: 'queued', action: 'erase-fill' })
    mockEnqueueAssetIntelligence.mockRejectedValue(new Error('Queue offline'))

    await expect(extractHandler({
      params: { id: '22222222-2222-4222-8222-222222222222' },
      body: {
        projectId: '11111111-1111-4111-8111-111111111111',
        action: 'erase-fill',
        prompt: 'erase badge',
        brushMaskKey: 'mask.png',
      }
    } as any)).rejects.toThrow('Queue offline')

    expect(mockMarkAssetIntelligenceJobFailed).toHaveBeenCalledWith('job-queued', 'Queue offline')
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

  it('lists derivatives for an asset', async () => {
    const res = await derivativesHandler({ params: { id: 'a1' } } as any)
    expect(mockListDerivatives).toHaveBeenCalledWith('a1')
    expect(res.derivatives[0].kind).toBe('foreground-png')
  })

  it('lists project intelligence jobs for the producer activity panel', async () => {
    const res = await jobsHandler({ params: { id: '11111111-1111-4111-8111-111111111111' }, query: { limit: '20' } } as any)
    expect(mockGetProject).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111')
    expect(mockListProjectIntelligenceJobs).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 20)
    expect(res.jobs).toEqual([{ id: 'j1', action: 'mask-lift', status: 'blocked' }])
  })

  it('returns a reviewable assemble plan instead of mutating the timeline', async () => {
    const res = await assembleHandler({ params: { id: '11111111-1111-4111-8111-111111111111' }, body: { brief: 'Create a TikTok edit', targetFormat: 'tiktok_9x16' } } as any)
    expect(res.plan).toMatchObject({ projectId: '11111111-1111-4111-8111-111111111111', status: 'draft', brief: 'Create a TikTok edit' })
    expect(res.plan.steps[0]).toMatchObject({ type: 'place-asset', assetId: 'a1' })
  })
})
