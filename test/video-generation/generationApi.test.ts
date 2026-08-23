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
const mockMarkJobFailed = vi.fn()
vi.mock('~~/server/utils/video-generation/jobs', () => ({
  createVideoGenerationJob: (...a: unknown[]) => mockCreateJob(...a),
  getVideoGenerationJobByIdempotencyKey: (...a: unknown[]) => mockGetJobByIdempotency(...a),
  getVideoGenerationJob: (...a: unknown[]) => mockGetJob(...a),
  markVideoGenerationJobFailed: (...a: unknown[]) => mockMarkJobFailed(...a),
}))

const mockResolveSourceAssetUrls = vi.fn()
vi.mock('~~/server/utils/video-generation/resolveSourceUrls', () => ({
  resolveSourceAssetUrls: (...a: unknown[]) => mockResolveSourceAssetUrls(...a),
}))

const mockEnqueue = vi.fn()
vi.mock('~~/server/utils/video-generation/enqueue', () => ({
  enqueueVideoGeneration: (...a: unknown[]) => mockEnqueue(...a),
}))

const mockLoadTenantPolicy = vi.fn()
vi.mock('~~/server/utils/video-generation/policy', () => ({
  loadTenantVideoGenerationPolicy: (...a: unknown[]) => mockLoadTenantPolicy(...a),
}))

const mockReserve = vi.fn()
vi.mock('~~/server/utils/video-generation/budget', () => ({
  reserveAndCreateVideoGenerationJob: (...a: unknown[]) => mockReserve(...a),
}))

const mockLoadSourceAssets = vi.fn()
vi.mock('~~/server/utils/video-generation/sourceAssets', () => ({
  loadVideoGenerationSourceAssets: (...a: unknown[]) => mockLoadSourceAssets(...a),
}))

const mockRecordAiInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...a: unknown[]) => mockRecordAiInvocation(...a),
}))

const mockIsTenantModel = vi.fn((model: any) => model.provider === 'aigateway'
  && model.surface === 'tenant'
  && model.defaultEnabled
  && model.safetyClass !== 'disabled')
vi.mock('~~/server/utils/video-generation/surface', () => ({
  isTenantModel: (...a: unknown[]) => mockIsTenantModel(...a),
}))

const { default: createH } = await import('../../server/api/agency/video/generation/jobs.post')
const { default: getH } = await import('../../server/api/agency/video/generation/jobs/[id].get')

const avProject = {
  id: '00000000-0000-4000-8000-000000000002',
  clientId: '00000000-0000-4000-8000-000000000010',
  createdBy: '00000000-0000-4000-8000-000000000001',
  mediaType: 'av',
  currentTimelineId: '00000000-0000-4000-8000-000000000003',
}

const timeline = { id: '00000000-0000-4000-8000-000000000003' }

const allowedBody = {
  projectId: avProject.id,
  mode: 'image-to-video',
  modelId: 'aigateway/seedance-i2v',
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
  mockRequireWriteAccess.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000001', role: 'editor' })
  mockGetProject.mockResolvedValue({ project: avProject, timeline })
  mockLoadTenantPolicy.mockResolvedValue({
    enabled: true,
    monthlyCapCents: 10_000,
    allowedModelIds: ['aigateway/seedance-i2v', 'aigateway/veo-t2v'],
  })
  mockLoadSourceAssets.mockResolvedValue([{ id: 'asset-1', approved: true, subjectType: 'vehicle' }])
  mockGetJobByIdempotency.mockResolvedValue(null)
  mockIsTenantModel.mockImplementation((model: any) => model.provider === 'aigateway'
    && model.surface === 'tenant'
    && model.defaultEnabled
    && model.safetyClass !== 'disabled')
  // The route now passes a reserved `id` (God mode ledger); the fixture's id must still win.
  mockCreateJob.mockImplementation(async (input) => ({ ...input, id: 'job-1', status: input.status ?? 'queued' }))
  mockReserve.mockImplementation(async (input) => ({
    ok: true,
    reused: false,
    job: { ...input, id: 'job-1', status: input.status ?? 'queued' },
  }))
  mockResolveSourceAssetUrls.mockResolvedValue(['https://r2.example/asset-1?sig=abc'])
  mockMarkJobFailed.mockResolvedValue(undefined)
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

  it('rejects hidden tenant models before creating or enqueueing jobs', async () => {
    const body = {
      ...allowedBody,
      mode: 'text-to-video',
      modelId: 'aigateway/veo-t2v',
      sourceAssetIds: [],
      prompt: 'Toyota Hilux driving through the dealership',
    }
    await expect(createH({ body, context: {} } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('rejects mock models even when tenant policy names them', async () => {
    const body = { ...allowedBody, modelId: 'mock/i2v-safe' }

    await expect(createH({ body, context: {} } as any)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockLoadTenantPolicy).not.toHaveBeenCalled()
    expect(mockReserve).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('creates and enqueues an allowed image-to-video job', async () => {
    const res = await createH({ body: allowedBody, context: {} } as any)

    // Allowed path goes through the atomic budget reservation, not the bare createJob.
    expect(mockReserve).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: avProject.clientId,
        projectId: avProject.id,
        timelineId: timeline.id,
        modelId: 'aigateway/seedance-i2v',
        estimatedCostCents: 150,
      }),
      expect.objectContaining({ enabled: true })
    )
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'job-1',
      tenantId: avProject.clientId,
      idempotencyKey: 'idem-1',
      sourceAssetUrls: ['https://r2.example/asset-1?sig=abc'],
    })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_generation_job',
      provider: 'aigateway',
      modelId: 'bytedance/seedance-2.0-fast',
      gatewayUsed: true,
      userId: '00000000-0000-4000-8000-000000000001',
      clientId: avProject.clientId,
      estimatedCostUsd: 1.5,
      status: 'success',
      metadata: expect.objectContaining({
        queued: true,
        projectId: avProject.id,
        jobId: 'job-1',
        registryModelId: 'aigateway/seedance-i2v',
      }),
    }))
    expect(g.setResponseStatus).toHaveBeenCalledWith(expect.anything(), 202)
    expect(res.job.id).toBe('job-1')
  })

  it('rejects model requests with unsupported mode or generation settings before budget work', async () => {
    await expect(createH({
      body: { ...allowedBody, mode: 'text-to-video', prompt: 'abstract color field', sourceAssetIds: [] },
      context: {},
    } as any)).rejects.toMatchObject({ statusCode: 400 })

    await expect(createH({
      body: { ...allowedBody, durationSeconds: 99 },
      context: {},
    } as any)).rejects.toMatchObject({ statusCode: 400 })

    await expect(createH({
      body: { ...allowedBody, aspectRatio: '4:3' },
      context: {},
    } as any)).rejects.toMatchObject({ statusCode: 400 })

    await expect(createH({
      body: { ...allowedBody, resolution: '4k' },
      context: {},
    } as any)).rejects.toMatchObject({ statusCode: 400 })

    await expect(createH({
      body: { ...allowedBody, sourceAssetIds: [] },
      context: {},
    } as any)).rejects.toMatchObject({ statusCode: 400 })

    mockIsTenantModel.mockReturnValueOnce(true)
    await expect(createH({
      body: {
        ...allowedBody,
        mode: 'text-to-video',
        modelId: 'aigateway/veo-t2v',
        sourceAssetIds: [],
        durationSeconds: 5,
        subjectType: 'vehicle',
      },
      context: {},
    } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Model does not support the requested subject type',
    })

    expect(mockLoadTenantPolicy).not.toHaveBeenCalled()
    expect(mockReserve).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('rejects unavailable source images before loading policy or reserving budget', async () => {
    mockLoadSourceAssets.mockRejectedValueOnce(new Error('source asset asset-1 is not owned by this tenant'))

    await expect(createH({ body: allowedBody, context: {} } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: expect.stringContaining('source asset asset-1 is not owned by this tenant'),
    })
    expect(mockLoadSourceAssets).toHaveBeenCalledWith(['asset-1'], avProject.clientId)
    expect(mockLoadTenantPolicy).not.toHaveBeenCalled()
    expect(mockReserve).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('forbids non-admin users from creating jobs on another user project', async () => {
    mockGetProject.mockResolvedValueOnce({
      project: { ...avProject, createdBy: '00000000-0000-4000-8000-000000000999' },
      timeline,
    })

    await expect(createH({ body: allowedBody, context: {} } as any)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockLoadTenantPolicy).not.toHaveBeenCalled()
    expect(mockReserve).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('allows owner roles to create jobs on accessible agency projects', async () => {
    mockRequireWriteAccess.mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000777', role: 'owner' })
    mockGetProject.mockResolvedValueOnce({
      project: { ...avProject, createdBy: '00000000-0000-4000-8000-000000000999' },
      timeline,
    })

    const res = await createH({ body: allowedBody, context: {} } as any)

    expect(mockReserve).toHaveBeenCalled()
    expect(res.job.id).toBe('job-1')
  })

  it('returns 402 and does not enqueue when the reservation exceeds the budget cap', async () => {
    mockReserve.mockResolvedValue({ ok: false, reason: 'tenant_cap_exceeded', remainingCents: 0 })

    await expect(createH({ body: allowedBody, context: {} } as any)).rejects.toMatchObject({ statusCode: 402 })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('reuses duplicate idempotency keys without enqueueing again', async () => {
    mockGetJobByIdempotency.mockResolvedValue({ id: 'existing-job', tenantId: avProject.clientId, projectId: avProject.id, idempotencyKey: 'idem-1' })

    const res = await createH({ body: allowedBody, context: {} } as any)

    expect(mockReserve).not.toHaveBeenCalled()
    expect(mockCreateJob).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
    expect(res.job.id).toBe('existing-job')
  })

  it('rejects duplicate idempotency keys that belong to another project', async () => {
    mockGetJobByIdempotency.mockResolvedValue({
      id: 'existing-job',
      tenantId: avProject.clientId,
      projectId: '00000000-0000-4000-8000-000000000999',
      idempotencyKey: 'idem-1',
    })

    await expect(createH({ body: allowedBody, context: {} } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockReserve).not.toHaveBeenCalled()
    expect(mockEnqueue).not.toHaveBeenCalled()
  })

  it('rejects reservation-level idempotency conflicts from concurrent requests', async () => {
    mockReserve.mockResolvedValue({ ok: false, reason: 'idempotency_key_conflict' })

    await expect(createH({ body: allowedBody, context: {} } as any)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockEnqueue).not.toHaveBeenCalled()
  })
})

describe('GET /agency/video/generation/jobs/:id', () => {
  it('returns a job by id', async () => {
    mockGetJob.mockResolvedValue({ id: 'job-1', projectId: avProject.id })

    const res = await getH({ params: { id: 'job-1' }, context: {} } as any)

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockGetProject).toHaveBeenCalledWith(avProject.id)
    expect(res.job.id).toBe('job-1')
  })

  it('forbids non-admin users from reading another user project job by id', async () => {
    mockGetJob.mockResolvedValueOnce({ id: 'job-1', projectId: avProject.id })
    mockGetProject.mockResolvedValueOnce({
      project: { ...avProject, createdBy: '00000000-0000-4000-8000-000000000999' },
      timeline,
    })

    await expect(getH({ params: { id: 'job-1' }, context: {} } as any)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('rejects reading jobs attached to non-AV projects', async () => {
    mockGetJob.mockResolvedValueOnce({ id: 'job-1', projectId: avProject.id })
    mockGetProject.mockResolvedValueOnce({
      project: { ...avProject, mediaType: 'audio' },
      timeline,
    })

    await expect(getH({ params: { id: 'job-1' }, context: {} } as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('allows owner roles to read an accessible agency project job by id', async () => {
    mockRequireWriteAccess.mockResolvedValueOnce({ id: '00000000-0000-4000-8000-000000000777', role: 'owner' })
    mockGetJob.mockResolvedValueOnce({ id: 'job-1', projectId: avProject.id })
    mockGetProject.mockResolvedValueOnce({
      project: { ...avProject, createdBy: '00000000-0000-4000-8000-000000000999' },
      timeline,
    })

    const res = await getH({ params: { id: 'job-1' }, context: {} } as any)

    expect(res.job.id).toBe('job-1')
  })
})
