import { describe, expect, it, vi } from 'vitest'
import { processAssetIntelligenceJob } from '~~/workers/asset-intelligence/src/worker'

const validMessage = { jobId: '11111111-1111-4111-8111-111111111111', projectId: 'project-1', sourceAssetId: 'asset-1' }

describe('asset intelligence worker', () => {
  it('marks job running, persists derivatives, then marks succeeded', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({
        id: 'job-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'mask-only',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        status: 'queued',
        prompt: null,
        brushMaskKey: 'mask.png',
      }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-1', status: 'running' }),
      markFailed: vi.fn(),
      markSucceeded: vi.fn().mockResolvedValue({ id: 'job-1', status: 'succeeded' }),
      createDerivative: vi.fn().mockResolvedValue({ id: 'derivative-1' }),
      recordInvocation: vi.fn().mockResolvedValue(undefined),
      runProvider: vi.fn().mockResolvedValue({
        derivatives: [{ kind: 'mask-png', r2Key: 'out-mask.png', width: null, height: null, metadata: { sourceMaskKey: 'mask.png' }, contentType: 'image/png', size: 128 }],
      }),
    }

    await processAssetIntelligenceJob(validMessage, deps)

    expect(deps.markRunning).toHaveBeenCalledWith('job-1')
    expect(deps.createDerivative).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'mask-png',
      r2Key: 'out-mask.png',
      metadata: { sourceMaskKey: 'mask.png', contentType: 'image/png', size: 128 },
    }))
    expect(deps.markSucceeded).toHaveBeenCalledWith({ id: 'job-1', outputDerivativeIds: ['derivative-1'] })
    expect(deps.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_asset_intelligence_worker_runtime',
      provider: 'replicate',
      modelId: 'replicate/sam-2',
      status: 'success',
      requestId: 'job-1',
      metadata: expect.objectContaining({
        outcome: 'succeeded',
        derivativeCount: 1,
        outputDerivativeIds: ['derivative-1'],
      }),
    }))
  })

  it('skips missing jobs without claiming or running providers', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue(null),
      markRunning: vi.fn(),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      runProvider: vi.fn(),
    }

    await expect(processAssetIntelligenceJob(validMessage, deps))
      .resolves.toEqual({ skipped: true, reason: 'missing_job' })

    expect(deps.markRunning).not.toHaveBeenCalled()
    expect(deps.runProvider).not.toHaveBeenCalled()
    expect(deps.createDerivative).not.toHaveBeenCalled()
    expect(deps.markSucceeded).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it.each([null, undefined, 'job-1', 42, {}, { projectId: 'project-1' }, { jobId: 'not-a-uuid' }, { jobId: '   ' }])(
    'skips malformed queue message bodies without side effects: %s',
    async (message) => {
      const deps = {
        getJob: vi.fn(),
        markRunning: vi.fn(),
        markFailed: vi.fn(),
        markSucceeded: vi.fn(),
        createDerivative: vi.fn(),
        runProvider: vi.fn(),
      }

      await expect(processAssetIntelligenceJob(message as any, deps))
        .resolves.toEqual({ skipped: true, reason: 'malformed_message' })

      expect(deps.getJob).not.toHaveBeenCalled()
      expect(deps.markRunning).not.toHaveBeenCalled()
      expect(deps.runProvider).not.toHaveBeenCalled()
      expect(deps.createDerivative).not.toHaveBeenCalled()
      expect(deps.markSucceeded).not.toHaveBeenCalled()
      expect(deps.markFailed).not.toHaveBeenCalled()
    }
  )

  it('propagates getJob errors so transient database failures can retry', async () => {
    const deps = {
      getJob: vi.fn().mockRejectedValue(new Error('database unavailable')),
      markRunning: vi.fn(),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      runProvider: vi.fn(),
    }

    await expect(processAssetIntelligenceJob(validMessage, deps))
      .rejects.toThrow('database unavailable')

    expect(deps.markRunning).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('treats markRunning as a claim step and skips side effects when the job was already final', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({ id: 'job-1', tenantId: 'tenant-1', projectId: 'project-1', sourceAssetId: 'asset-1', action: 'mask-only', modelId: 'replicate/sam-2', provider: 'replicate', status: 'queued', prompt: null, brushMaskKey: 'mask.png' }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-1', status: 'succeeded' }),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      runProvider: vi.fn(),
    }

    await processAssetIntelligenceJob(validMessage, deps)

    expect(deps.runProvider).not.toHaveBeenCalled()
    expect(deps.createDerivative).not.toHaveBeenCalled()
    expect(deps.markSucceeded).not.toHaveBeenCalled()
  })

  it('does not report success when the success finalizer loses a final-state race', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({ id: 'job-1', tenantId: 'tenant-1', projectId: 'project-1', sourceAssetId: 'asset-1', action: 'mask-only', modelId: 'replicate/sam-2', provider: 'replicate', status: 'queued', prompt: null, brushMaskKey: 'mask.png' }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-1', status: 'running' }),
      markFailed: vi.fn(),
      markSucceeded: vi.fn().mockResolvedValue({ id: 'job-1', status: 'failed' }),
      createDerivative: vi.fn().mockResolvedValue({ id: 'derivative-1' }),
      runProvider: vi.fn().mockResolvedValue({
        derivatives: [{ kind: 'mask-png', r2Key: 'out-mask.png', width: null, height: null, metadata: {} }],
      }),
    }

    await expect(processAssetIntelligenceJob(validMessage, deps))
      .resolves.toEqual({ skipped: true, reason: 'not_claimed' })

    expect(deps.markSucceeded).toHaveBeenCalledWith({ id: 'job-1', outputDerivativeIds: ['derivative-1'] })
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('records worker runtime failures after marking the job failed', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({
        id: 'job-1',
        tenantId: 'tenant-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'asset-analysis',
        modelId: 'workers-ai/kimi-planner',
        provider: 'workers-ai',
        status: 'queued',
        prompt: 'inspect',
        brushMaskKey: null,
      }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-1', status: 'running' }),
      markFailed: vi.fn().mockResolvedValue({ id: 'job-1', status: 'failed' }),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      recordInvocation: vi.fn().mockResolvedValue(undefined),
      runProvider: vi.fn().mockRejectedValue(new Error('provider timeout')),
    }

    await expect(processAssetIntelligenceJob(validMessage, deps))
      .resolves.toEqual({ skipped: false, status: 'failed' })

    expect(deps.markFailed).toHaveBeenCalledWith('job-1', 'provider timeout')
    expect(deps.recordInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_asset_intelligence_worker_runtime',
      provider: 'workers-ai',
      modelId: 'workers-ai/kimi-planner',
      gatewayUsed: true,
      status: 'error',
      errorCode: 'asset_intelligence_worker_failed',
      metadata: expect.objectContaining({ outcome: 'failed', errorMessage: 'provider timeout' }),
    }))
  })

  it.each(['succeeded', 'failed', 'blocked'])('skips %s jobs before attempting to claim them', async (status) => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({ id: 'job-1', tenantId: 'tenant-1', projectId: 'project-1', sourceAssetId: 'asset-1', action: 'mask-only', modelId: 'replicate/sam-2', provider: 'replicate', status, prompt: null, brushMaskKey: 'mask.png' }),
      markRunning: vi.fn(),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      runProvider: vi.fn(),
    }

    await processAssetIntelligenceJob(validMessage, deps)

    expect(deps.markRunning).not.toHaveBeenCalled()
    expect(deps.runProvider).not.toHaveBeenCalled()
    expect(deps.createDerivative).not.toHaveBeenCalled()
    expect(deps.markSucceeded).not.toHaveBeenCalled()
    expect(deps.markFailed).not.toHaveBeenCalled()
  })

  it('marks an erase job failed with the reason the editor can act on, and saves no result', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({
        id: 'job-9', tenantId: 'tenant-1', projectId: 'project-1', sourceAssetId: 'asset-1',
        action: 'erase-fill', modelId: 'workers-ai/flux-edit', provider: 'workers-ai', status: 'queued', prompt: null, brushMaskKey: 'mask.png',
      }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-9', status: 'running' }),
      markFailed: vi.fn().mockResolvedValue({ id: 'job-9', status: 'failed' }),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      recordInvocation: vi.fn().mockResolvedValue(undefined),
      runProvider: vi.fn().mockRejectedValue(new Error('The painted mask (540 x 960) does not match the shape of the picture (1920 x 1080). Paint it again in Prepare.')),
    }

    const result = await processAssetIntelligenceJob(validMessage, deps)

    expect(result).toEqual({ skipped: false, status: 'failed' })
    expect(deps.markFailed).toHaveBeenCalledWith('job-9', 'The painted mask (540 x 960) does not match the shape of the picture (1920 x 1080). Paint it again in Prepare.')
    expect(deps.createDerivative).not.toHaveBeenCalled()
    expect(deps.markSucceeded).not.toHaveBeenCalled()
  })

  it('records the erased picture with its size and what it was made from', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({
        id: 'job-10', tenantId: 'tenant-1', projectId: 'project-1', sourceAssetId: 'asset-1',
        action: 'erase-fill', modelId: 'workers-ai/flux-edit', provider: 'workers-ai', status: 'queued', prompt: null, brushMaskKey: 'mask.png',
      }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-10', status: 'running' }),
      markFailed: vi.fn(),
      markSucceeded: vi.fn().mockResolvedValue({ id: 'job-10', status: 'succeeded' }),
      createDerivative: vi.fn().mockResolvedValue({ id: 'derivative-10' }),
      recordInvocation: vi.fn().mockResolvedValue(undefined),
      runProvider: vi.fn().mockResolvedValue({
        derivatives: [{ kind: 'edited-image', r2Key: 'out/edited.png', width: 1920, height: 1080, metadata: { source: 'video-frame', title: 'Erased still from video frame' }, contentType: 'image/png', size: 2048 }],
      }),
    }

    const result = await processAssetIntelligenceJob(validMessage, deps)

    expect(result).toEqual({ skipped: false, status: 'succeeded' })
    expect(deps.createDerivative).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'edited-image', width: 1920, height: 1080, sourceAssetId: 'asset-1', projectId: 'project-1',
      metadata: { source: 'video-frame', title: 'Erased still from video frame', contentType: 'image/png', size: 2048 },
    }))
    expect(deps.markSucceeded).toHaveBeenCalledWith({ id: 'job-10', outputDerivativeIds: ['derivative-10'] })
    expect(deps.markFailed).not.toHaveBeenCalled()
  })
})
