import { describe, expect, it, vi } from 'vitest'
import { processAssetIntelligenceJob } from '~~/workers/asset-intelligence/src/worker'

describe('asset intelligence worker', () => {
  it('marks job running, persists derivatives, then marks succeeded', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({
        id: 'job-1',
        projectId: 'project-1',
        sourceAssetId: 'asset-1',
        action: 'mask-only',
        modelId: 'replicate/sam-2',
        provider: 'replicate',
        prompt: null,
        brushMaskKey: 'mask.png',
      }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-1', status: 'running' }),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn().mockResolvedValue({ id: 'derivative-1' }),
      runProvider: vi.fn().mockResolvedValue({
        derivatives: [{ kind: 'mask-png', r2Key: 'out-mask.png', width: null, height: null, metadata: {} }],
      }),
    }

    await processAssetIntelligenceJob({ jobId: 'job-1', projectId: 'project-1', sourceAssetId: 'asset-1' }, deps)

    expect(deps.markRunning).toHaveBeenCalledWith('job-1')
    expect(deps.createDerivative).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mask-png', r2Key: 'out-mask.png' }))
    expect(deps.markSucceeded).toHaveBeenCalledWith({ id: 'job-1', outputDerivativeIds: ['derivative-1'] })
  })

  it('treats markRunning as a claim step and skips side effects when the job was already final', async () => {
    const deps = {
      getJob: vi.fn().mockResolvedValue({ id: 'job-1', projectId: 'project-1', sourceAssetId: 'asset-1', action: 'mask-only', modelId: 'replicate/sam-2', provider: 'replicate', prompt: null, brushMaskKey: 'mask.png' }),
      markRunning: vi.fn().mockResolvedValue({ id: 'job-1', status: 'succeeded' }),
      markFailed: vi.fn(),
      markSucceeded: vi.fn(),
      createDerivative: vi.fn(),
      runProvider: vi.fn(),
    }

    await processAssetIntelligenceJob({ jobId: 'job-1', projectId: 'project-1', sourceAssetId: 'asset-1' }, deps)

    expect(deps.runProvider).not.toHaveBeenCalled()
    expect(deps.createDerivative).not.toHaveBeenCalled()
    expect(deps.markSucceeded).not.toHaveBeenCalled()
  })
})
