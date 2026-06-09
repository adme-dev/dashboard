import { describe, expect, it, vi } from 'vitest'
import { processVideoGenerationJob } from '../../workers/video-generation/src/worker'
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'

const baseJob: VideoGenerationJob = {
  id: 'job-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  timelineId: 'timeline-1',
  createdBy: 'user-1',
  status: 'queued',
  mode: 'image-to-video',
  modelId: 'mock/i2v-safe',
  provider: 'mock',
  prompt: 'subtle reveal',
  sourceAssetIds: ['asset-1'],
  durationSeconds: 5,
  aspectRatio: '16:9',
  resolution: '720p',
  subjectType: 'vehicle',
  complianceStatus: 'vehicle_i2v',
  complianceReasons: ['ok'],
  estimatedCostCents: 250,
  actualCostCents: null,
  idempotencyKey: 'idem-1',
  providerRequestId: null,
  providerStatus: null,
  providerResultUrl: null,
  outputAssetId: null,
  outputR2Key: null,
  errorMessage: null,
  createdAt: '2026-06-09T00:00:00.000Z',
  updatedAt: '2026-06-09T00:00:00.000Z',
  startedAt: null,
  completedAt: null,
}

function deps(job: VideoGenerationJob, overrides: Record<string, any> = {}) {
  return {
    getJob: vi.fn().mockResolvedValue(job),
    markRunning: vi.fn().mockResolvedValue({ ...job, status: 'running' }),
    markFailed: vi.fn().mockResolvedValue({ ...job, status: 'failed' }),
    markSucceeded: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
    createOutputAsset: vi.fn().mockResolvedValue({ id: 'asset-out', r2Key: 'video-generation/job-1/output.mp4' }),
    provider: {
      submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
      poll: vi.fn().mockResolvedValue({
        status: 'succeeded',
        outputUrl: 'https://provider.example/output.mp4',
        actualCostCents: 123,
      }),
    },
    ...overrides,
  }
}

describe('video generation worker orchestration', () => {
  it('skips succeeded jobs', async () => {
    const d = deps({ ...baseJob, status: 'succeeded' })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: true, reason: 'terminal_or_running' })
    expect(d.provider.submit).not.toHaveBeenCalled()
  })

  it('marks running before provider submit', async () => {
    const d = deps(baseJob)

    await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(d.markRunning).toHaveBeenCalledWith('job-1')
    expect(d.provider.submit).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
  })

  it('marks failed on provider error', async () => {
    const d = deps(baseJob, {
      provider: {
        submit: vi.fn().mockRejectedValue(new Error('provider unavailable')),
        poll: vi.fn(),
      },
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result.status).toBe('failed')
    expect(d.markFailed).toHaveBeenCalledWith('job-1', 'provider unavailable')
  })

  it('marks succeeded and links the output asset on provider success', async () => {
    const d = deps(baseJob)

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(d.createOutputAsset).toHaveBeenCalledWith(baseJob, expect.objectContaining({ outputUrl: 'https://provider.example/output.mp4' }))
    expect(d.markSucceeded).toHaveBeenCalledWith({
      id: 'job-1',
      providerStatus: 'succeeded',
      providerResultUrl: 'https://provider.example/output.mp4',
      outputAssetId: 'asset-out',
      outputR2Key: 'video-generation/job-1/output.mp4',
      actualCostCents: 123,
    })
    expect(result.status).toBe('succeeded')
  })
})
