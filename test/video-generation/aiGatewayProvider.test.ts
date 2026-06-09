import { describe, expect, it, vi } from 'vitest'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'

/** Dispatch a fake env.AI.run on the call shape: a `requests` array = submit (queueRequest),
 *  a `request_id` = poll. Tests stage the poll response per case. */
function makeRun(opts: { submitResponse?: any; pollResponse?: any }) {
  return vi.fn(async (_model: string, inputs: any, _options?: any) => {
    if (inputs && 'request_id' in inputs) return opts.pollResponse
    return opts.submitResponse ?? { status: 'queued', request_id: 'cf-req-1' }
  })
}

const i2vReq = {
  jobId: 'job-1', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video' as const,
  prompt: 'slow pan', sourceAssetUrls: ['https://r2/still.png'], durationSeconds: 5,
  aspectRatio: '9:16', resolution: '720p', tenantId: 'dealer-1',
}

describe('aiGateway provider (asynchronous CF batch API)', () => {
  it('submit() queues via queueRequest with the image input + tenant metadata, returns the CF request_id', async () => {
    const run = makeRun({ submitResponse: { status: 'queued', model: 'bytedance/seedance-2.0-fast', request_id: 'cf-req-1' } })
    const provider = makeAiGatewayProvider({ run })

    const sub = await provider.submit(i2vReq)

    expect(sub.providerRequestId).toBe('cf-req-1')
    expect(sub.status).toBe('queued')
    expect(sub.modelId).toBe('aigateway/seedance-i2v')
    const [model, inputs, options] = run.mock.calls[0]
    expect(model).toBe('bytedance/seedance-2.0-fast')
    // CF async batch envelope: a `requests` array, with queueRequest in the options.
    expect(inputs.requests[0]).toMatchObject({ prompt: 'slow pan', image: 'https://r2/still.png', duration: 5, aspect_ratio: '9:16', resolution: '720p' })
    expect(options).toMatchObject({ queueRequest: true, gateway: { metadata: { tenantId: 'dealer-1', jobId: 'job-1' } } })
  })

  it('submit() omits the image for text-to-video', async () => {
    const run = makeRun({})
    const provider = makeAiGatewayProvider({ run })
    await provider.submit({ jobId: 'j', modelId: 'aigateway/veo-t2v-internal', mode: 'text-to-video', prompt: 'x', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null })
    expect(run.mock.calls[0][1].requests[0].image).toBeUndefined()
  })

  it('submit() throws if the gateway returns no request_id', async () => {
    const run = makeRun({ submitResponse: { status: 'error' } })
    const provider = makeAiGatewayProvider({ run })
    await expect(provider.submit(i2vReq)).rejects.toThrow(/request_id/)
  })

  it('submit() throws if the model has no cfModel mapping', async () => {
    const provider = makeAiGatewayProvider({ run: vi.fn() })
    await expect(provider.submit({ ...i2vReq, modelId: 'muapi/i2v-kling' })).rejects.toThrow(/no cfModel/)
  })

  it('poll() reports running while the job is queued or running', async () => {
    const run = makeRun({ pollResponse: { status: 'running' } })
    const provider = makeAiGatewayProvider({ run })

    const res = await provider.poll({ providerRequestId: 'cf-req-1', status: 'queued', modelId: 'aigateway/seedance-i2v' })

    expect(res.status).toBe('running')
    expect(res.outputUrl).toBeNull()
    // poll calls the same cfModel with just the request_id.
    const pollCall = run.mock.calls.find((c) => c[1] && 'request_id' in c[1])!
    expect(pollCall[0]).toBe('bytedance/seedance-2.0-fast')
    expect(pollCall[1]).toEqual({ request_id: 'cf-req-1' })
  })

  it('poll() reports succeeded with the url from a completed batch response', async () => {
    const run = makeRun({ pollResponse: { responses: [{ id: 0, result: { video: 'https://cf/out.mp4' }, success: true }] } })
    const provider = makeAiGatewayProvider({ run })

    const res = await provider.poll({ providerRequestId: 'cf-req-1', status: 'running', modelId: 'aigateway/seedance-i2v' })

    expect(res).toMatchObject({ status: 'succeeded', outputUrl: 'https://cf/out.mp4', actualCostCents: null })
  })

  it('poll() tolerates a flat result shape (result.url / videos[0])', async () => {
    const run = makeRun({ pollResponse: { result: { videos: ['https://cf/a.mp4'] } } })
    const provider = makeAiGatewayProvider({ run })
    const res = await provider.poll({ providerRequestId: 'r', status: 'running', modelId: 'aigateway/seedance-i2v' })
    expect(res.outputUrl).toBe('https://cf/a.mp4')
  })

  it('poll() reports failed when the batch response completes without a video', async () => {
    const run = makeRun({ pollResponse: { responses: [{ id: 0, result: {}, success: false }] } })
    const provider = makeAiGatewayProvider({ run })
    const res = await provider.poll({ providerRequestId: 'r', status: 'running', modelId: 'aigateway/seedance-i2v' })
    expect(res.status).toBe('failed')
    expect(res.outputUrl).toBeNull()
  })

  it('poll() fails clearly when the submission carries no modelId', async () => {
    const provider = makeAiGatewayProvider({ run: vi.fn() })
    const res = await provider.poll({ providerRequestId: 'r', status: 'running' })
    expect(res.status).toBe('failed')
    expect(res.errorMessage).toMatch(/modelId/)
  })
})
