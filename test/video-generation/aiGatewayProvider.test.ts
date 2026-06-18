import { describe, expect, it, vi } from 'vitest'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'

const i2vReq = {
  jobId: 'job-1', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video' as const,
  prompt: 'slow pan', sourceAssetUrls: ['https://r2/still.png'], durationSeconds: 5,
  aspectRatio: '9:16', resolution: '720p', tenantId: 'dealer-1', projectId: 'project-1', userId: 'user-1',
}

const completedResponse = { state: 'Completed', result: { video: 'https://cf/out.mp4' }, gatewayMetadata: { keySource: 'Unified' } }

describe('aiGateway provider (synchronous partner video models)', () => {
  it('submit() sends FLAT inputs (no batch envelope) with tenant metadata and blocks to completion', async () => {
    const run = vi.fn(async () => completedResponse)
    const provider = makeAiGatewayProvider({ run })

    const sub = await provider.submit(i2vReq)

    expect(sub.providerRequestId).toBe('job-1')
    expect(sub.status).toBe('completed')
    expect(sub.modelId).toBe('aigateway/seedance-i2v')
    const [model, inputs, options] = run.mock.calls[0]!
    expect(model).toBe('bytedance/seedance-2.0-fast')
    // Documented partner shape: flat inputs. The batch { requests: [...] } envelope is
    // rejected by these models with 7003: User Input Error.
    expect(inputs).toEqual({ prompt: 'slow pan', image: 'https://r2/still.png', duration: 5, aspect_ratio: '9:16', resolution: '720p' })
    expect((inputs as any).requests).toBeUndefined()
    expect(options).toMatchObject({ gateway: { metadata: { tenantId: 'dealer-1', projectId: 'project-1', userId: 'user-1', jobId: 'job-1', modelId: 'aigateway/seedance-i2v' } } })
    expect((options as any).queueRequest).toBeUndefined()
  })

  it('submit() omits the image for text-to-video and fills veo required defaults', async () => {
    const run = vi.fn(async () => completedResponse)
    const provider = makeAiGatewayProvider({ run })
    await provider.submit({ jobId: 'j', modelId: 'aigateway/veo-t2v-internal', mode: 'text-to-video', prompt: 'x', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null })
    // veo schema: image_input absent for t2v; duration is a string enum; resolution + generate_audio required.
    expect(run.mock.calls[0]![1]).toEqual({ prompt: 'x', duration: '6s', aspect_ratio: '16:9', resolution: '720p', generate_audio: true })
  })

  it('submit() throws if the model has no cfModel mapping', async () => {
    const provider = makeAiGatewayProvider({ run: vi.fn() })
    await expect(provider.submit({ ...i2vReq, modelId: 'mock/i2v-safe' })).rejects.toThrow(/no cfModel/)
  })

  it('poll() right after submit() returns the completed result (same-invocation handoff)', async () => {
    const run = vi.fn(async () => completedResponse)
    const provider = makeAiGatewayProvider({ run })

    const sub = await provider.submit(i2vReq)
    const res = await provider.poll(sub)

    expect(res).toMatchObject({ status: 'succeeded', outputUrl: 'https://cf/out.mp4', actualCostCents: null })
    expect(run).toHaveBeenCalledTimes(1) // poll must NOT re-run the generation
  })

  it('poll() reports failed when the run completed without a video url', async () => {
    const run = vi.fn(async () => ({ state: 'Failed', result: {} }))
    const provider = makeAiGatewayProvider({ run })

    const sub = await provider.submit(i2vReq)
    const res = await provider.poll(sub)

    expect(res.status).toBe('failed')
    expect(res.outputUrl).toBeNull()
    expect(res.errorMessage).toMatch(/no video url/)
    expect(res.errorMessage).toMatch(/Failed/)
  })

  it('poll() tolerates the REST double-wrapped envelope ({ result: { state, result: { video } } })', async () => {
    const run = vi.fn(async () => ({ result: { state: 'Completed', result: { video: 'https://cf/rest.mp4' } }, success: true, errors: [], messages: [] }))
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ ...i2vReq, jobId: 'job-rest' })
    const res = await provider.poll(sub)
    expect(res).toMatchObject({ status: 'succeeded', outputUrl: 'https://cf/rest.mp4' })
  })

  it('poll() tolerates alternate result field names (url / videos[0])', async () => {
    const run = vi.fn(async () => ({ state: 'Completed', result: { videos: ['https://cf/a.mp4'] } }))
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ ...i2vReq, jobId: 'job-alt' })
    const res = await provider.poll(sub)
    expect(res.outputUrl).toBe('https://cf/a.mp4')
  })

  it('poll() tolerates output_url result field names', async () => {
    const run = vi.fn(async () => ({ state: 'Completed', result: { output_url: 'https://cf/output-url.mp4' } }))
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ ...i2vReq, jobId: 'job-output-url' })
    const res = await provider.poll(sub)
    expect(res.outputUrl).toBe('https://cf/output-url.mp4')
  })

  it('poll() includes Cloudflare error details when no video url is returned', async () => {
    const run = vi.fn(async () => ({
      success: false,
      errors: [{ code: 7003, message: 'User Input Error' }],
      result: { state: 'Failed' },
    }))
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ ...i2vReq, jobId: 'job-error-detail' })
    const res = await provider.poll(sub)
    expect(res.status).toBe('failed')
    expect(res.errorMessage).toContain('User Input Error')
  })

  it('cross-process poll() (reconcile cron, no cached result) reports running for the reaper', async () => {
    const provider = makeAiGatewayProvider({ run: vi.fn() })
    const res = await provider.poll({ providerRequestId: 'job-elsewhere', status: 'running', modelId: 'aigateway/seedance-i2v' })
    expect(res.status).toBe('running')
    expect(res.outputUrl).toBeNull()
  })

  it('the cached result is consumed once (second poll falls back to running)', async () => {
    const run = vi.fn(async () => completedResponse)
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ ...i2vReq, jobId: 'job-once' })
    await provider.poll(sub)
    const second = await provider.poll(sub)
    expect(second.status).toBe('running')
  })
})
