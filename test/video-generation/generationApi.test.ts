import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface TestEvent {
  params?: Record<string, string>
  body?: any
  context?: any
}

const g = globalThis as any
g.defineEventHandler = (fn: any) => fn
g.getRouterParam = (e: TestEvent, n: string) => e.params?.[n]
g.readBody = async (e: TestEvent) => e.body ?? {}
g.createError = (i: any) => Object.assign(new Error(i.statusMessage), i)
g.setResponseStatus = vi.fn()

const mockRequireWriteAccess = vi.fn()
vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...a: unknown[]) => mockRequireWriteAccess(...a),
}))

const mockGetProject = vi.fn()
vi.mock('~~/server/utils/audio/projects', () => ({
  getProjectWithCurrentTimeline: (...a: unknown[]) => mockGetProject(...a),
}))

const mockCreateJob = vi.fn()
const mockGetJobByIdempotency = vi.fn()
const mockGetJob = vi.fn()
vi.mock('~~/server/utils/video-generation/jobs', () => ({
  createVideoGenerationJob: (...a: unknown[]) => mockCreateJob(...a),
  getVideoGenerationJobByIdempotencyKey: (...a: unknown[]) => mockGetJobByIdempotency(...a),
  getVideoGenerationJob: (...a: unknown[]) => mockGetJob(...a),
}))

const mockEnqueue = vi.fn()
vi.mock('~~/server/utils/video-generation/enqueue', () => ({
  enqueueVideoGeneration: (...a: unknown[]) => mockEnqueue(...a),
}))

const mockLoadTenantPolicy = vi.fn()
const mockGetTenantSpend = vi.fn()
vi.mock('~~/server/utils/video-generation/policy', () => ({
  loadTenantVideoGenerationPolicy: (...a: unknown[]) => mockLoadTenantPolicy(...a),
  getTenantVideoGenerationSpendCents: (...a: unknown[]) => mockGetTenantSpend(...a),
}))

const mockLoadSourceAssets = vi.fn()
vi.mock('~~/server/utils/video-generation/sourceAssets', () => ({
  loadVideoGenerationSourceAssets: (...a: unknown[]) => mockLoadSourceAssets(...a),
}))

const { default: createH } = await import('../../server/api/agency/video/generation/jobs.post')
const { default: getH } = await import('../../server/api/agency/video/generation/jobs/[id].get')

const avProject = {
  id: '00000000-0000-4000-8000-000000000002',
  clientId: '00000000-0000-4000-8000-000000000010',
  mediaType: 'av',
  currentTimelineId: '00000000-0000-4000-8000-000000000003',
}

const timeline = { id: '00000000-0000-4000-8000-000000000003' }

const allowedBody = {
  projectId: avProject.id,
  mode: 'image-to-video',
  modelId: 'mock/i2v-safe',
  prompt: 'subtle parallax showroom reveal',
  sourceAssetIds: ['asset-1'],
  durationSeconds: 5,
  aspectRatio: '16:9',
  resolution: '720p',
  subjectType: 'vehicle',
  idempotencyKey: 'idem-1',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.VIDEO_STUDIO_ENABLED = 'true'
  process.env.VIDEO_GENERATION_ENABLED = 'true'
  mockRequireWriteAccess.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001' })
  mockGetProject.mockResolvedValue({ project: avProject, timeline })
  mockLoadTenantPolicy.mockResolvedValue({
    enabled: true,
    monthlyCapCents: 10_000,
    allowedModelIds: ['mock/i2v-safe', 'mock/t2v-broll'],
  })
  mockGetTenantSpend.mockResolvedValue(0)
  mockLoadSourceAssets.mockResolvedValue([{ id: 'asset-1', approved: true, subjectType: 'vehicle' }])
  mockGetJobByIdempotency.mockResolvedValue(null)
  mockCreateJob.mockImplementation(async (input) => ({ id: 'job-1', ...input, status: input.status ?? 'queued' }))
})

afterEach(() => {
  delete process.env.VIDEO_STUDIO_ENABLED
  delete process.env.VIDEO_GENERATION_ENABLED
})

describe('POST /agency/video/generation/jobs', () => {
  it('returns 404 when generation flags are off', async () => {
    delete process.env.VIDEO_GENERATION_ENABLED

    await expect(createH({ body: allowedBody, context: {} } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateJob).not.toHaveBeenCalled()
  })

  it('returns 422 and does not enqueue blocked vehicle text-to-video', async () => {
    const body = {
      ...allowedBody,
      mode: 'text-to-video',
      modelId: 'mock/t2v-broll',
      sourceAssetIds: [],
      prompt: 'Toyota Hilux driving through the dealership',
    }
    mockLoadSourceAssets.mockResolvedValue([])

    await expect(createH({ body, context: {} } as any)).rejects.toMatchObject({ statusCode: 422 })
    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }))
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('creates and enqueues an allowed image-to-video job', async () => {
    const res = await createH({ body: allowedBody, context: {} } as any)

    expect(mockCreateJob).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: avProject.clientId,
      projectId: avProject.id,
      timelineId: timeline.id,
      modelId: 'mock/i2v-safe',
      estimatedCostCents: 250,
    }))
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'job-1',
      tenantId: avProject.clientId,
      idempotencyKey: 'idem-1',
    })
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    expect(res.job.id).toBe('job-1')
  })

  it('reuses duplicate idempotency keys without enqueueing again', async () => {
    mockGetJobByIdempotency.mockResolvedValue({ id: 'existing-job', tenantId: avProject.clientId, idempotencyKey: 'idem-1' })

    const res = await createH({ body: allowedBody, context: {} } as any)

    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(res.job.id).toBe('existing-job')
  })
})

describe('GET /agency/video/generation/jobs/:id', () => {
  it('returns a job by id', async () => {
    mockGetJob.mockResolvedValue({ id: 'job-1' })

    const res = await getH({ params: { id: 'job-1' }, context: {} } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(res.job.id).toBe('job-1')
  })
})
