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
})
