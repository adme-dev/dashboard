import { describe, expect, it, vi } from 'vitest'
import type { VideoGenerationJob } from '~~/server/utils/video-generation/types'

const mockRecordAiInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

const { finalizeVideoGenerationJob } = await import('~~/server/utils/video-generation/finalize')

const job = { id: 'job-1', tenantId: 'agency', projectId: 'p1', createdBy: 'u1', provider: 'aigateway', modelId: 'aigateway/seedance-i2v', providerRequestId: 'req-1', aspectRatio: '9:16', durationSeconds: 5 } as unknown as VideoGenerationJob

describe('finalizeVideoGenerationJob', () => {
  it('downloads the output, stores it in R2, creates an asset, and marks succeeded', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: 'video-generation/agency/job-1/output.mp4' }),
      markSucceeded: vi.fn().mockResolvedValue({ ...job, status: 'succeeded' }),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://cdn/out.mp4', actualCostCents: 42 }, deps as any)
    expect(deps.fetchImpl).toHaveBeenCalledWith('https://cdn/out.mp4')
    expect(deps.uploadFile).toHaveBeenCalledWith(expect.any(Buffer), 'video-generation/agency/job-1/output.mp4', 'video/mp4', expect.any(Object))
    expect(deps.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', outputAssetId: 'asset-1', actualCostCents: 42 }))
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      featureKey: 'video_generation_completion',
      provider: 'aigateway',
      modelId: 'aigateway/seedance-i2v',
      gatewayUsed: true,
      userId: 'u1',
      requestId: 'job-1',
      estimatedCostUsd: 0.42,
      status: 'success',
      metadata: expect.objectContaining({
        completionPath: 'finalize',
        providerRequestId: 'req-1',
        outputAssetId: 'asset-1',
      }),
    }))
    expect(result.status).toBe('succeeded')
  })

  it('throws when the result has no output url', async () => {
    const deps = { fetchImpl: vi.fn(), uploadFile: vi.fn(), createVideoAsset: vi.fn(), markSucceeded: vi.fn() }
    await expect(finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: null, actualCostCents: null }, deps as any)).rejects.toThrow(/without an output url/)
    expect(deps.fetchImpl).not.toHaveBeenCalled()
  })

  it('throws (so the caller can mark failed) when the output download fails', async () => {
    const deps = { fetchImpl: vi.fn().mockResolvedValue({ ok: false, status: 404 }), uploadFile: vi.fn(), createVideoAsset: vi.fn(), markSucceeded: vi.fn() }
    await expect(finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://cdn/out.mp4', actualCostCents: null }, deps as any)).rejects.toThrow(/download failed: 404/)
    expect(deps.uploadFile).not.toHaveBeenCalled()
  })
})
