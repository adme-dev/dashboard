const validMp4 = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0])
import { describe, expect, it, vi } from 'vitest'
import { stampVideoGenerationTransition, type VideoGenerationJob } from '~~/server/utils/video-generation/types'

const mockRecordAiInvocation = vi.fn()
vi.mock('~~/server/utils/ai/invocationLedger', () => ({
  recordAiInvocation: (...args: unknown[]) => mockRecordAiInvocation(...args),
}))

const outputKey = 'video-generation/agency/job-1/output-aeca4ec81179e906402b14b4a58f8f3c8fbf2d71356cd3f116b43d72555e7208.mp4'

const { finalizeVideoGenerationJob } = await import('~~/server/utils/video-generation/finalize')

const job = { id: 'job-1', tenantId: 'agency', projectId: 'p1', createdBy: 'u1', provider: 'aigateway', modelId: 'aigateway/seedance-i2v', providerRequestId: 'req-1', aspectRatio: '9:16', durationSeconds: 5 } as unknown as VideoGenerationJob

describe('finalizeVideoGenerationJob', () => {
  it('downloads the output, stores it in R2, creates an asset, and marks succeeded', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: outputKey }),
      markSucceeded: vi.fn().mockImplementation(async (input: {
        providerStatus: string
        outputAssetId: string
        outputR2Key: string
        outputSha256?: string | null
        actualCostCents: number | null
      }) => stampVideoGenerationTransition({
        ...job,
        status: 'succeeded',
        providerStatus: input.providerStatus,
        outputAssetId: input.outputAssetId,
        outputR2Key: input.outputR2Key,
        outputSha256: input.outputSha256,
        actualCostCents: input.actualCostCents,
      }, true)),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: 42 }, deps as any)
    expect(deps.fetchImpl).toHaveBeenCalledWith('https://8.8.8.8/out.mp4', expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }))
    expect(deps.uploadFile).toHaveBeenCalledWith(expect.any(Buffer), outputKey, 'video/mp4', expect.any(Object))
    expect(deps.createVideoAsset).toHaveBeenCalledWith(expect.objectContaining({ format: '9:16', width: null, height: null }))
    expect(deps.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1', outputAssetId: 'asset-1', outputSha256: 'aeca4ec81179e906402b14b4a58f8f3c8fbf2d71356cd3f116b43d72555e7208', actualCostCents: 42 }))
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

  it('throws (so the caller retains uncertain liability) when the output download fails', async () => {
    const deps = { fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 404 })), uploadFile: vi.fn(), createVideoAsset: vi.fn(), markSucceeded: vi.fn() }
    await expect(finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: null }, deps as any)).rejects.toThrow(/safely downloaded/)
    expect(deps.uploadFile).not.toHaveBeenCalled()
  })

  it('returns the canonical failed row and does not ledger this attempt when compare-and-swap loses', async () => {
    mockRecordAiInvocation.mockReset()
    const winner = stampVideoGenerationTransition({
      ...job,
      status: 'failed',
      outputAssetId: null,
      outputR2Key: null,
      outputSha256: null,
      actualCostCents: 80,
      liabilityState: 'uncertain',
    }, false)
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: outputKey }),
      markSucceeded: vi.fn().mockResolvedValue(winner),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: 42 }, deps as any)
    expect(result).toMatchObject({ status: 'failed', outputAssetId: null, outputR2Key: null, actualCostCents: 80 })
    expect(deps.markSucceeded).toHaveBeenCalledTimes(1)
    expect(deps.markSucceeded).toHaveBeenCalledWith(expect.objectContaining({ outputAssetId: 'asset-1', actualCostCents: 42 }))
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('returns the different winning output and does not ledger a second completion cost', async () => {
    mockRecordAiInvocation.mockReset()
    const winner = stampVideoGenerationTransition({
      ...job,
      status: 'succeeded',
      providerStatus: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      outputSha256: 'b'.repeat(64),
      actualCostCents: 7,
    }, false)
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: outputKey }),
      markSucceeded: vi.fn().mockResolvedValue(winner),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: 42 }, deps as any)
    expect(result).toMatchObject({
      status: 'succeeded',
      outputAssetId: 'canonical-asset',
      outputR2Key: 'canonical/winner.mp4',
      actualCostCents: 7,
    })
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('does not ledger a same-output retry when the compare-and-swap did not apply', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: outputKey }),
      markSucceeded: vi.fn().mockImplementation(async (input: {
        outputAssetId: string
        outputR2Key: string
        outputSha256?: string | null
        actualCostCents: number | null
      }) => stampVideoGenerationTransition({
        ...job,
        status: 'succeeded',
        outputAssetId: input.outputAssetId,
        outputR2Key: input.outputR2Key,
        outputSha256: input.outputSha256,
        actualCostCents: input.actualCostCents,
      }, false)),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: 42 }, deps as any)
    expect(result).toMatchObject({ status: 'succeeded', outputAssetId: 'asset-1', outputR2Key: outputKey, actualCostCents: 42 })
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('returns an unknown row without success accounting when the compare-and-swap does not apply', async () => {
    mockRecordAiInvocation.mockReset()
    const winner = stampVideoGenerationTransition({
      ...job,
      status: 'unknown',
      liabilityState: 'uncertain',
      actualCostCents: null,
      outputAssetId: null,
    }, false)
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: outputKey }),
      markSucceeded: vi.fn().mockResolvedValue(winner),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: 42 }, deps as any)
    expect(result).toMatchObject({ status: 'unknown', actualCostCents: null, outputAssetId: null })
    expect(mockRecordAiInvocation).not.toHaveBeenCalled()
  })

  it('records the canonical cost when this call applied the success transition', async () => {
    mockRecordAiInvocation.mockReset()
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(validMp4, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-1', r2Key: outputKey }),
      markSucceeded: vi.fn().mockImplementation(async (input: { outputAssetId: string, outputR2Key: string, outputSha256?: string | null }) => stampVideoGenerationTransition({
        ...job,
        status: 'succeeded',
        providerStatus: 'succeeded',
        outputAssetId: input.outputAssetId,
        outputR2Key: input.outputR2Key,
        outputSha256: input.outputSha256,
        actualCostCents: 0,
      }, true)),
    }
    const result = await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: 42 }, deps as any)
    expect(result).toMatchObject({ status: 'succeeded', outputAssetId: 'asset-1', actualCostCents: 0 })
    expect(mockRecordAiInvocation).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      estimatedCostUsd: 0,
      metadata: expect.objectContaining({ outputAssetId: 'asset-1', outputR2Key: outputKey }),
    }))
  })
})


describe('Pages finalizer output framing parity', () => {
  it('registers measured MP4 framing when it differs from the requested format', async () => {
    const bytes = new Uint8Array(124)
    bytes.set(validMp4)
    const view = new DataView(bytes.buffer)
    for (const [offset, type, size] of [[16, 'moov', 108], [24, 'trak', 100], [32, 'tkhd', 92]] as const) {
      view.setUint32(offset, size)
      bytes.set([...type].map(char => char.charCodeAt(0)), offset + 4)
    }
    view.setUint32(116, 1280 * 65536)
    view.setUint32(120, 720 * 65536)
    const deps = {
      fetchImpl: vi.fn().mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'video/mp4' } })),
      uploadFile: vi.fn().mockResolvedValue({ url: '/x' }),
      createVideoAsset: vi.fn().mockResolvedValue({ id: 'asset-measured', r2Key: 'output.mp4' }),
      markSucceeded: vi.fn().mockResolvedValue(stampVideoGenerationTransition({ ...job, status: 'succeeded' }, false))
    }
    await finalizeVideoGenerationJob(job, { status: 'succeeded', outputUrl: 'https://8.8.8.8/out.mp4', actualCostCents: null }, deps as never)
    expect(deps.createVideoAsset).toHaveBeenCalledWith(expect.objectContaining({ format: '16:9', width: 1280, height: 720 }))
  })
})
