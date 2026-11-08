import { describe, expect, it, vi } from 'vitest'
import workerEntrypoint from '../../workers/video-generation/src/index'
import { processVideoGenerationJob } from '../../workers/video-generation/src/worker'
import { stampVideoGenerationTransition, type VideoGenerationJob } from '~~/server/utils/video-generation/types'

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
  liabilityState: 'reserved',
  liabilityCents: 250,
  requestFingerprint: null,
  submissionAttemptedAt: null,
  dispatchEligible: true,
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
    claimSubmission: vi.fn().mockResolvedValue({ ...job, submissionAttemptedAt: '2026-06-09T00:00:01.000Z', liabilityState: 'uncertain' }),
    markRunning: vi.fn().mockImplementation(async () => stampVideoGenerationTransition({
      ...job,
      status: 'running' as const,
      submissionAttemptedAt: '2026-06-09T00:00:01.000Z',
    }, true)),
    markUnknown: vi.fn().mockImplementation(async () => stampVideoGenerationTransition({
      ...job,
      status: 'unknown' as const,
      liabilityState: 'uncertain' as const,
    }, true)),
    markFailed: vi.fn().mockImplementation(async () => stampVideoGenerationTransition({
      ...job,
      status: 'failed' as const,
    }, true)),
    markSucceeded: vi.fn().mockImplementation(async (input: {
      providerStatus: string
      providerResultUrl: string
      outputAssetId: string | null
      outputR2Key: string | null
      outputSha256?: string | null
      actualCostCents: number | null
    }) => stampVideoGenerationTransition({
      ...job,
      status: 'succeeded' as const,
      providerStatus: input.providerStatus,
      providerResultUrl: input.providerResultUrl,
      outputAssetId: input.outputAssetId,
      outputR2Key: input.outputR2Key,
      outputSha256: input.outputSha256 ?? null,
      actualCostCents: input.actualCostCents,
    }, true)),
    createOutputAsset: vi.fn().mockResolvedValue({ id: 'asset-out', r2Key: 'video-generation/job-1/output.mp4', sha256: 'a'.repeat(64) }),
    recordInvocation: vi.fn().mockResolvedValue(undefined),
    providers: {
      mock: {
        submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
        poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://provider.example/output.mp4', actualCostCents: 123 }),
      },
    },
    ...overrides,
  }
}

describe('video generation worker orchestration', () => {
  it('returns 404 for direct HTTP requests', async () => {
    const response = await workerEntrypoint.fetch()

    expect(response.status).toBe(404)
    await expect(response.text()).resolves.toBe('Not found')
  })

  it('skips succeeded jobs', async () => {
    const d = deps({ ...baseJob, status: 'succeeded' })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: true, reason: 'terminal_or_running' })
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
  })

  it('claims before provider submit and then marks running', async () => {
    const d = deps(baseJob)
    const order: string[] = []
    d.claimSubmission.mockImplementation(async () => {
      order.push('claim')
      return { ...baseJob, submissionAttemptedAt: '2026-06-09T00:00:01.000Z', liabilityState: 'uncertain' }
    })
    d.providers.mock.submit.mockImplementation(async () => {
      order.push('submit')
      return { providerRequestId: 'provider-job-1', status: 'submitted' }
    })
    d.markRunning.mockImplementation(async () => {
      order.push('running')
      return { ...baseJob, status: 'running' }
    })

    await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(order.indexOf('claim')).toBeLessThan(order.indexOf('submit'))
    expect(order.indexOf('submit')).toBeLessThan(order.indexOf('running'))
    expect(d.markRunning).toHaveBeenCalledWith('job-1', 'provider-job-1')
    expect(d.providers.mock.submit).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
  })

  it('defers a queued async submission to the reconcile cron without polling', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'cf-req-1', status: 'queued', modelId: 'aigateway/seedance-i2v' }),
          poll: vi.fn(),
        },
      },
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'running' })
    expect(d.markRunning).toHaveBeenCalledWith('job-1', 'cf-req-1')
    expect(d.providers.mock.poll).not.toHaveBeenCalled()
    expect(d.markSucceeded).not.toHaveBeenCalled()
    expect(d.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_generation_worker_runtime',
      provider: 'mock',
      modelId: 'mock/i2v-safe',
      status: 'success',
      metadata: expect.objectContaining({ outcome: 'submitted_async', providerRequestId: 'cf-req-1' }),
    }))
  })

  it('leaves an unknown outcome when submit throws and does not retry the provider', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockRejectedValue(new Error('provider unavailable')),
          poll: vi.fn(),
        },
      },
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'unknown' })
    expect(d.claimSubmission).toHaveBeenCalledWith('job-1')
    expect(d.markUnknown).toHaveBeenCalledWith('job-1', 'video_generation_unknown_outcome')
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_generation_worker_runtime',
      status: 'error',
      errorCode: 'video_generation_unknown_outcome',
      metadata: expect.objectContaining({ outcome: 'unknown' }),
    }))
    const metadata = d.recordInvocation.mock.calls[0]?.[0]?.metadata
    expect(metadata).not.toHaveProperty('prompt')
    expect(JSON.stringify(metadata)).not.toContain('subtle reveal')
  })

  it('does not submit a duplicate delivery after the claim is already held', async () => {
    const d = deps({ ...baseJob, submissionAttemptedAt: '2026-06-09T00:00:01.000Z', liabilityState: 'uncertain' })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: true, reason: 'claim_already_held' })
    expect(d.claimSubmission).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markUnknown).not.toHaveBeenCalled()
  })

  it('does not submit when the compare-and-swap claim is lost', async () => {
    const d = deps(baseJob)
    d.claimSubmission.mockResolvedValue(null)

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: true, reason: 'claim_lost' })
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
    expect(d.markRunning).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markUnknown).not.toHaveBeenCalled()
  })

  it('refuses to run without the submission claim dependency', async () => {
    const d = deps(baseJob)
    delete (d as { claimSubmission?: unknown }).claimSubmission

    await expect(processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d))
      .rejects.toThrow('video generation submission claim is required')
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
  })

  it('does not claim or submit a reservation that is not dispatch eligible', async () => {
    const d = deps({ ...baseJob, dispatchEligible: false })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: true, reason: 'not_dispatch_eligible' })
    expect(d.claimSubmission).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
  })

  it('retains an explicit charge when the provider reports a known failure', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
          poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: 80, errorMessage: 'charged https://cdn.example/v.mp4?X-Amz-Signature=secret' }),
        },
      },
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'failed' })
    expect(d.markFailed).toHaveBeenCalledWith('job-1', 'provider_failed', 80)
    expect(JSON.stringify(d.markFailed.mock.calls)).not.toContain('X-Amz-Signature')
    expect(JSON.stringify(d.recordInvocation.mock.calls)).not.toContain('X-Amz-Signature')
    expect(d.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      errorCode: 'video_generation_provider_failed',
      metadata: expect.objectContaining({ outcome: 'provider_failed', providerStatus: 'failed' }),
    }))
    expect(d.markUnknown).not.toHaveBeenCalled()
  })

  it('keeps the estimate when a known provider failure has no actual cost', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
          poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'nsfw' }),
        },
      },
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'failed' })
    expect(d.markFailed).toHaveBeenCalledWith('job-1', 'provider_failed', null)
  })

  it.each([
    ['succeeded without an output URL', { status: 'succeeded', outputUrl: null, actualCostCents: 40, errorMessage: 'nsfw https://cdn.example/out.mp4?X-Amz-Signature=secret' }],
    ['an unrecognized runtime status', { status: 'FAILED', outputUrl: 'https://cdn.example/leak.mp4?X-Amz-Signature=secret', actualCostCents: 40, errorMessage: 'pending body subtle reveal' }],
  ])('keeps %s unknown and does not fail or resubmit', async (_label, pollResult) => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
          poll: vi.fn().mockResolvedValue(pollResult),
        },
      },
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'unknown' })
    expect(d.markUnknown).toHaveBeenCalledTimes(1)
    expect(d.markUnknown).toHaveBeenCalledWith('job-1', 'video_generation_unknown_outcome', 'provider-job-1')
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markSucceeded).not.toHaveBeenCalled()
    expect(d.createOutputAsset).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
    expect(d.providers.mock.poll).toHaveBeenCalledTimes(1)
    expect(d.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      errorCode: 'video_generation_unknown_outcome',
      estimatedCostUsd: null,
      metadata: expect.objectContaining({ outcome: 'unknown' }),
    }))
    const recorded = JSON.stringify(d.markUnknown.mock.calls) + JSON.stringify(d.recordInvocation.mock.calls)
    expect(recorded).not.toContain('X-Amz-Signature')
    expect(recorded).not.toContain('subtle reveal')
    expect(recorded).not.toContain('nsfw')
    expect(recorded).not.toContain('FAILED')
  })

  it('returns the canonical row when an ambiguous poll loses the unknown compare-and-swap', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
          poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: '', actualCostCents: 40, errorMessage: 'late' }),
        },
      },
    })
    d.markUnknown.mockResolvedValue({
      ...baseJob,
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      providerRequestId: 'provider-job-1',
      actualCostCents: 7,
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.markUnknown).toHaveBeenCalledWith('job-1', 'video_generation_unknown_outcome', 'provider-job-1')
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markSucceeded).not.toHaveBeenCalled()
    expect(d.createOutputAsset).not.toHaveBeenCalled()
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
  })

  it('does not turn an asset-write exception into a released failure', async () => {
    const d = deps(baseJob)
    d.createOutputAsset.mockRejectedValue(new Error('r2 unavailable'))

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'unknown' })
    expect(d.markUnknown).toHaveBeenCalledWith('job-1', 'video_generation_unknown_outcome', 'provider-job-1')
    expect(d.markFailed).not.toHaveBeenCalled()
  })

  it('keeps a provider id when the post-submit write throws and does not resubmit', async () => {
    const d = deps(baseJob)
    d.markRunning.mockRejectedValue(new Error('db down'))

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'unknown' })
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
    expect(d.markUnknown).toHaveBeenCalledWith('job-1', 'video_generation_unknown_outcome', 'provider-job-1')
    expect(d.markFailed).not.toHaveBeenCalled()
  })

  it('does not store the prompt when an exception echoes it', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockRejectedValue(new Error('rejected body subtle reveal')),
          poll: vi.fn(),
        },
      },
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

      expect(result).toEqual({ skipped: false, status: 'unknown' })
      expect(d.markUnknown).toHaveBeenCalledWith('job-1', 'video_generation_unknown_outcome')
      const recorded = JSON.stringify(d.recordInvocation.mock.calls)
      expect(recorded).not.toContain('subtle reveal')
      expect(JSON.stringify(d.markUnknown.mock.calls)).not.toContain('subtle reveal')
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('subtle reveal')
    } finally {
      errorSpy.mockRestore()
    }
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
      outputSha256: 'a'.repeat(64),
      actualCostCents: 123,
    })
    expect(d.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_generation_worker_runtime',
      provider: 'mock',
      modelId: 'mock/i2v-safe',
      requestId: 'job-1',
      estimatedCostUsd: 1.23,
      status: 'success',
      metadata: expect.objectContaining({
        outcome: 'succeeded',
        outputAssetId: 'asset-out',
        outputR2Key: 'video-generation/job-1/output.mp4',
      }),
    }))
    expect(result.status).toBe('succeeded')
  })

  it('leaves async jobs running (no finalize) when poll returns running', async () => {
    const d = deps({ ...baseJob, provider: 'aigateway', modelId: 'aigateway/seedance-i2v' }, {
      providers: {
        aigateway: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'req-9', status: 'submitted' }),
          poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }),
        },
      },
    })
    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
    expect(result).toEqual({ skipped: false, status: 'running' })
    expect(d.markRunning).toHaveBeenCalledWith('job-1', 'req-9')
    expect(d.markSucceeded).not.toHaveBeenCalled()
    expect(d.createOutputAsset).not.toHaveBeenCalled()
  })

  it('selects the provider by job.provider', async () => {
    const d = deps({ ...baseJob, provider: 'aigateway', modelId: 'aigateway/seedance-i2v' }, {
      providers: {
        mock: { submit: vi.fn(), poll: vi.fn() },
        aigateway: { submit: vi.fn().mockResolvedValue({ providerRequestId: 'req-9', status: 'submitted' }), poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }) },
      },
    })
    await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
    expect(d.providers.aigateway.submit).toHaveBeenCalled()
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
  })

  it('marks the job failed when no provider is registered for job.provider', async () => {
    const d = deps({ ...baseJob, provider: 'ghost' }, { providers: { mock: { submit: vi.fn(), poll: vi.fn() } } })
    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
    expect(result).toEqual({ skipped: false, status: 'failed' })
    expect(d.markFailed).toHaveBeenCalledWith('job-1', 'provider_missing')
    expect(d.claimSubmission).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
  })

  it('returns the canonical success when the missing-provider write loses', async () => {
    const d = deps({ ...baseJob, provider: 'ghost' }, { providers: { mock: { submit: vi.fn(), poll: vi.fn() } } })
    d.markFailed.mockResolvedValue(stampVideoGenerationTransition({
      ...baseJob,
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      actualCostCents: 7,
    }, false))

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.claimSubmission).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).not.toHaveBeenCalled()
  })

  it('passes tenantId into the provider request', async () => {
    const d = deps(baseJob)
    await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)
    expect(d.providers.mock.submit).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant-1' }))
  })

  it('uses message.sourceAssetUrls over job.sourceAssetIds when present', async () => {
    const d = deps(baseJob)
    await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1', sourceAssetUrls: ['https://r2/x?sig'] }, d)
    expect(d.providers.mock.submit).toHaveBeenCalledWith(expect.objectContaining({ sourceAssetUrls: ['https://r2/x?sig'] }))
  })

  it('does not report failure when a fenced write leaves the job succeeded', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockResolvedValue({ providerRequestId: 'provider-job-1', status: 'submitted' }),
          poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'late' }),
        },
      },
    })
    d.markFailed.mockResolvedValue({ ...baseJob, status: 'succeeded' })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.createOutputAsset).not.toHaveBeenCalled()
    expect(d.markSucceeded).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
  })

  it('does not ledger the candidate when compare-and-swap returns an existing failure', async () => {
    const d = deps(baseJob)
    d.markSucceeded.mockResolvedValue({
      ...baseJob,
      status: 'failed',
      outputAssetId: null,
      outputR2Key: null,
      actualCostCents: 80,
      liabilityState: 'uncertain',
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'failed' })
    expect(d.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({
      outputAssetId: 'asset-out',
      outputR2Key: 'video-generation/job-1/output.mp4',
      actualCostCents: 123,
    }))
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markUnknown).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
  })

  it('does not ledger completion cost when a different output already won', async () => {
    const d = deps(baseJob)
    d.markSucceeded.mockResolvedValue(stampVideoGenerationTransition({
      ...baseJob,
      status: 'succeeded',
      providerStatus: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      outputSha256: 'b'.repeat(64),
      actualCostCents: 7,
    }, false))

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({
      outputAssetId: 'asset-out',
      actualCostCents: 123,
    }))
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
  })

  it('does not ledger a same-output retry when the compare-and-swap did not apply', async () => {
    const d = deps(baseJob)
    d.markSucceeded.mockResolvedValue(stampVideoGenerationTransition({
      ...baseJob,
      status: 'succeeded',
      providerStatus: 'succeeded',
      outputAssetId: 'asset-out',
      outputR2Key: 'video-generation/job-1/output.mp4',
      outputSha256: 'a'.repeat(64),
      actualCostCents: 123,
    }, false))

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.recordInvocation).not.toHaveBeenCalled()
  })

  it('records a canonical zero cost when this call applied the success transition', async () => {
    const d = deps(baseJob)
    d.markSucceeded.mockResolvedValue(stampVideoGenerationTransition({
      ...baseJob,
      status: 'succeeded',
      providerStatus: 'succeeded',
      outputAssetId: 'asset-out',
      outputR2Key: 'video-generation/job-1/output.mp4',
      outputSha256: 'a'.repeat(64),
      actualCostCents: 0,
    }, true))

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({ estimatedCostUsd: 0 }))
  })

  it('keeps unknown liability when the success compare-and-swap does not apply', async () => {
    const d = deps(baseJob)
    d.markSucceeded.mockResolvedValue({ ...baseJob, status: 'unknown', liabilityState: 'uncertain', actualCostCents: null })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'unknown' })
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markUnknown).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
  })

  it('does not poll or ledger a candidate after markRunning loses to a failed row', async () => {
    const d = deps(baseJob)
    d.markRunning.mockResolvedValue({ ...baseJob, status: 'failed', actualCostCents: 80, liabilityState: 'uncertain' })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'failed' })
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
    expect(d.providers.mock.poll).not.toHaveBeenCalled()
    expect(d.createOutputAsset).not.toHaveBeenCalled()
    expect(d.markSucceeded).not.toHaveBeenCalled()
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.markUnknown).not.toHaveBeenCalled()
    expect(d.recordInvocation).not.toHaveBeenCalled()
  })

  it('returns the canonical success when an exception loses to a succeeded row', async () => {
    const d = deps(baseJob, {
      providers: {
        mock: {
          submit: vi.fn().mockRejectedValue(new Error('socket hang up')),
          poll: vi.fn(),
        },
      },
    })
    d.markUnknown.mockResolvedValue({
      ...baseJob,
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      actualCostCents: 7,
    })

    const result = await processVideoGenerationJob({ jobId: 'job-1', tenantId: 'tenant-1', idempotencyKey: 'idem-1' }, d)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(d.markFailed).not.toHaveBeenCalled()
    expect(d.recordInvocation).not.toHaveBeenCalled()
    expect(d.providers.mock.submit).toHaveBeenCalledTimes(1)
  })
})
