import { describe, expect, it, vi } from 'vitest'
import { stampVideoGenerationTransition, type VideoGenerationJob } from '~~/server/utils/video-generation/types'

const mockRecordAiInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

const mockMarkVideoGenerationJobUnknown = vi.fn()
vi.mock('~~/server/utils/video-generation/jobs', () => ({
  markVideoGenerationJobUnknown: (...args: unknown[]) => mockMarkVideoGenerationJobUnknown(...args),
  markVideoGenerationJobFailed: vi.fn(),
}))

const { reconcileRunningJob } = await import('~~/server/utils/video-generation/reconcile')

const job = { id: 'j1', tenantId: 'agency', projectId: 'p1', createdBy: 'u1', provider: 'aigateway', modelId: 'aigateway/seedance-i2v', providerRequestId: 'req-1', aspectRatio: '9:16', durationSeconds: 5 } as unknown as VideoGenerationJob

describe('reconcileRunningJob', () => {
  it('finalizes when the provider now reports succeeded', async () => {
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://cdn/o.mp4', actualCostCents: 30 }) } },
      finalize: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
      markFailed: vi.fn(),
    }
    const r = await reconcileRunningJob(job, deps as any)
    expect(deps.finalize).toHaveBeenCalled()
    expect(r).toBe('succeeded')
  })

  it('leaves still-running jobs untouched', async () => {
    const deps = { providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'running', outputUrl: null, actualCostCents: null }) } }, finalize: vi.fn(), markFailed: vi.fn() }
    expect(await reconcileRunningJob(job, deps as any)).toBe('running')
    expect(deps.finalize).not.toHaveBeenCalled()
  })

  it('skips a job with no providerRequestId', async () => {
    const deps = { providers: { aigateway: { submit: vi.fn(), poll: vi.fn() } }, finalize: vi.fn(), markFailed: vi.fn() }
    const noReq = { ...job, providerRequestId: null } as any
    expect(await reconcileRunningJob(noReq, deps as any)).toBe('skipped')
    expect(deps.providers.aigateway.poll).not.toHaveBeenCalled()
  })

  it('marks failed when the provider now reports failed', async () => {
    mockRecordAiInvocation.mockReset()
    const leaked = 'nsfw https://cdn.example/out.mp4?X-Amz-Signature=secret subtle reveal'
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: leaked }) } },
      finalize: vi.fn(),
      markFailed: vi.fn().mockImplementation(async () => stampVideoGenerationTransition({ ...job, status: 'failed' }, true)),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('failed')
    expect(deps.markFailed).toHaveBeenCalledWith('j1', 'provider_failed', null)
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_generation_completion',
      provider: 'aigateway',
      modelId: 'aigateway/seedance-i2v',
      status: 'error',
      errorCode: 'video_generation_reconcile_failed',
      metadata: expect.objectContaining({
        completionPath: 'reconcile',
        providerRequestId: 'req-1',
        providerStatus: 'failed',
        outcome: 'provider_failed',
      }),
    }))
    const recorded = JSON.stringify(mockRecordAiInvocation.mock.calls) + JSON.stringify(deps.markFailed.mock.calls)
    expect(recorded).not.toContain('X-Amz-Signature')
    expect(recorded).not.toContain('subtle reveal')
    expect(recorded).not.toContain('nsfw')
    expect(deps.finalize).not.toHaveBeenCalled()
  })

  it('passes an explicit provider cost, including zero, through a known failure', async () => {
    const charged = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: 40, errorMessage: 'billed https://cdn.example/a?sig=1' }) } },
      finalize: vi.fn(),
      markFailed: vi.fn().mockImplementation(async () => stampVideoGenerationTransition({ ...job, status: 'failed', actualCostCents: 40 }, true)),
    }
    expect(await reconcileRunningJob(job, charged as any)).toBe('failed')
    expect(charged.markFailed).toHaveBeenCalledWith('j1', 'provider_failed', 40)

    const zero = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: 0, errorMessage: 'free failure' }) } },
      finalize: vi.fn(),
      markFailed: vi.fn().mockImplementation(async () => stampVideoGenerationTransition({ ...job, status: 'failed', actualCostCents: 0 }, true)),
    }
    expect(await reconcileRunningJob(job, zero as any)).toBe('failed')
    expect(zero.markFailed).toHaveBeenCalledWith('j1', 'provider_failed', 0)
  })

  it('does not record a failure when a fenced write leaves the job succeeded', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'late https://cdn.example/a?X-Amz-Signature=secret' }) } },
      finalize: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(stampVideoGenerationTransition({
        ...job,
        status: 'succeeded',
        outputAssetId: 'canonical-asset',
        actualCostCents: 7,
      }, false)),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('succeeded')
    expect(deps.finalize).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('does not mark a job failed when the provider poll throws', async () => {
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockRejectedValue(new Error('socket hang up')) } },
      finalize: vi.fn(),
      markFailed: vi.fn(),
    }
    await expect(reconcileRunningJob(job, deps as any)).rejects.toThrow('socket hang up')
    expect(deps.markFailed).not.toHaveBeenCalled()
    expect(deps.finalize).not.toHaveBeenCalled()
  })

  it('returns the canonical failure when finalize loses to an existing failed row', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://cdn/o.mp4', actualCostCents: 30 }) } },
      finalize: vi.fn().mockResolvedValue({ ...job, status: 'failed', outputAssetId: null, outputR2Key: null, actualCostCents: 80, liabilityState: 'uncertain' }),
      markFailed: vi.fn(),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('failed')
    expect(deps.finalize).toHaveBeenCalledTimes(1)
    expect(deps.markFailed).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('returns succeeded from the canonical row when a different output already won', async () => {
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://cdn/late.mp4', actualCostCents: 99 }) } },
      finalize: vi.fn().mockResolvedValue({ ...job, status: 'succeeded', outputAssetId: 'canonical-asset', outputR2Key: 'canonical/winner.mp4', actualCostCents: 7 }),
      markFailed: vi.fn(),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('succeeded')
    expect(deps.finalize).toHaveBeenCalledWith(job, expect.objectContaining({ outputUrl: 'https://cdn/late.mp4', actualCostCents: 99 }))
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('preserves unknown liability when finalize does not settle a terminal row', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: 'https://cdn/o.mp4', actualCostCents: null }) } },
      finalize: vi.fn().mockResolvedValue({ ...job, status: 'unknown', liabilityState: 'uncertain', actualCostCents: null }),
      markFailed: vi.fn(),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('unknown')
    expect(deps.markFailed).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it.each([
    ['succeeded without an output URL', { status: 'succeeded', outputUrl: null, actualCostCents: 40, errorMessage: 'nsfw https://cdn.example/out.mp4?X-Amz-Signature=secret' }],
    ['an unrecognized runtime status', { status: 'FAILED', outputUrl: 'https://cdn.example/leak.mp4?X-Amz-Signature=secret', actualCostCents: 40, errorMessage: 'pending body subtle reveal' }],
  ])('keeps %s recoverable and does not fail or resubmit', async (_label, pollResult) => {
    mockRecordAiInvocation.mockReset()
    mockMarkVideoGenerationJobUnknown.mockReset()
    mockMarkVideoGenerationJobUnknown.mockResolvedValue(stampVideoGenerationTransition({
      ...job,
      status: 'unknown',
      liabilityState: 'uncertain',
      providerRequestId: 'req-1',
      actualCostCents: null,
    }, true))
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue(pollResult) } },
      finalize: vi.fn(),
      markFailed: vi.fn(),
    }

    expect(await reconcileRunningJob(job, deps as any)).toBe('unknown')
    expect(mockMarkVideoGenerationJobUnknown).toHaveBeenCalledWith('j1', 'video_generation_unknown_outcome', 'req-1')
    expect(deps.markFailed).not.toHaveBeenCalled()
    expect(deps.finalize).not.toHaveBeenCalled()
    expect(deps.providers.aigateway.submit).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
    const recorded = JSON.stringify(mockMarkVideoGenerationJobUnknown.mock.calls)
    expect(recorded).not.toContain('X-Amz-Signature')
    expect(recorded).not.toContain('subtle reveal')
    expect(recorded).not.toContain('nsfw')
    expect(recorded).not.toContain('40')
  })

  it('returns the canonical row when an ambiguous poll loses the unknown compare-and-swap', async () => {
    mockRecordAiInvocation.mockReset()
    mockMarkVideoGenerationJobUnknown.mockReset()
    mockMarkVideoGenerationJobUnknown.mockResolvedValue(stampVideoGenerationTransition({
      ...job,
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      providerRequestId: 'req-1',
      actualCostCents: 7,
    }, false))
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'succeeded', outputUrl: '', actualCostCents: 99, errorMessage: 'late' }) } },
      finalize: vi.fn(),
      markFailed: vi.fn(),
    }

    expect(await reconcileRunningJob(job, deps as any)).toBe('succeeded')
    expect(mockMarkVideoGenerationJobUnknown).toHaveBeenCalledWith('j1', 'video_generation_unknown_outcome', 'req-1')
    expect(deps.markFailed).not.toHaveBeenCalled()
    expect(deps.finalize).not.toHaveBeenCalled()
    expect(deps.providers.aigateway.submit).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('does not record a failure or resubmit when markFailed leaves the job unknown', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      providers: { aigateway: { submit: vi.fn(), poll: vi.fn().mockResolvedValue({ status: 'failed', outputUrl: null, actualCostCents: null, errorMessage: 'late' }) } },
      finalize: vi.fn(),
      markFailed: vi.fn().mockResolvedValue(stampVideoGenerationTransition({ ...job, status: 'unknown', liabilityState: 'uncertain' }, false)),
    }
    expect(await reconcileRunningJob(job, deps as any)).toBe('unknown')
    expect(deps.providers.aigateway.submit).not.toHaveBeenCalled()
    expect(deps.finalize).not.toHaveBeenCalled()
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })
})
