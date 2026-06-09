import { describe, expect, it, vi } from 'vitest'
import { makeAiGatewayProvider } from '~~/server/utils/video-generation/providers/aiGatewayProvider'

describe('aiGateway provider (synchronous)', () => {
  it('submit() runs the cfModel with an image input for i2v + tenant metadata, and poll() returns the video url', async () => {
    const run = vi.fn().mockResolvedValue({ result: { video: 'https://cf/out.mp4' } })
    const provider = makeAiGatewayProvider({ run })
    const req = {
      jobId: 'job-1', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video' as const,
      prompt: 'slow pan', sourceAssetUrls: ['https://r2/still.png'], durationSeconds: 5,
      aspectRatio: '9:16', resolution: '720p', tenantId: 'dealer-1',
    }
    const sub = await provider.submit(req)
    expect(sub.providerRequestId).toBe('job-1')
    const [model, inputs, meta] = run.mock.calls[0]
    expect(model).toBe('bytedance/seedance-2.0-fast')
    expect(inputs).toMatchObject({ prompt: 'slow pan', image: 'https://r2/still.png', duration: 5, aspect_ratio: '9:16', resolution: '720p' })
    expect(meta).toMatchObject({ tenantId: 'dealer-1', jobId: 'job-1' })
    const res = await provider.poll(sub)
    expect(res).toMatchObject({ status: 'succeeded', outputUrl: 'https://cf/out.mp4', actualCostCents: null })
  })

  it('omits image for text-to-video and tolerates result.output / result.url / videos[0]', async () => {
    const run = vi.fn().mockResolvedValue({ result: { videos: ['https://cf/a.mp4'] } })
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ jobId: 'j', modelId: 'aigateway/veo-t2v-internal', mode: 'text-to-video', prompt: 'x', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null })
    expect(run.mock.calls[0][1].image).toBeUndefined()
    expect((await provider.poll(sub)).outputUrl).toBe('https://cf/a.mp4')
  })

  it('poll() reports failed when the model returns no video url', async () => {
    const run = vi.fn().mockResolvedValue({ result: {} })
    const provider = makeAiGatewayProvider({ run })
    const sub = await provider.submit({ jobId: 'j2', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video', prompt: 'x', sourceAssetUrls: ['https://r2/s.png'], durationSeconds: 5, aspectRatio: '9:16', resolution: null })
    expect(await provider.poll(sub)).toMatchObject({ status: 'failed', outputUrl: null })
  })

  it('omits image for image-to-video when no source url is supplied', async () => {
    const run = vi.fn().mockResolvedValue({ result: { video: 'https://cf/o.mp4' } })
    const provider = makeAiGatewayProvider({ run })
    await provider.submit({ jobId: 'j3', modelId: 'aigateway/seedance-i2v', mode: 'image-to-video', prompt: 'x', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '9:16', resolution: null })
    expect(run.mock.calls[0][1].image).toBeUndefined()
  })

  it('submit() throws if the model has no cfModel mapping', async () => {
    const provider = makeAiGatewayProvider({ run: vi.fn() })
    await expect(provider.submit({ jobId: 'j', modelId: 'muapi/i2v-kling', mode: 'image-to-video', prompt: 'x', sourceAssetUrls: ['u'], durationSeconds: 5, aspectRatio: '9:16', resolution: null }))
      .rejects.toThrow(/no cfModel/)
  })
})
