import { describe, expect, it, vi } from 'vitest'
import { makeMuapiProvider } from '~~/server/utils/video-generation/providers/muapiProvider'

const cfg = { apiKey: 'k-test', baseUrl: 'https://api.muapi.ai/api/v1', webhookUrl: 'https://app.example/api/agency/video/generation/webhook' }

describe('muapi provider', () => {
  it('submit() posts to the model endpoint with x-api-key and returns the request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ request_id: 'req-123' }),
    })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    const submission = await provider.submit({
      jobId: 'job-1', modelId: 'muapi/i2v-kling', mode: 'image-to-video',
      prompt: 'slow dolly in', sourceAssetUrls: ['https://r2.example/still.png'],
      durationSeconds: 5, aspectRatio: '9:16', resolution: '720p',
    })
    expect(submission.providerRequestId).toBe('req-123')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.muapi.ai/api/v1/generate_kling_i2v')
    expect(init.method).toBe('POST')
    expect(init.headers['x-api-key']).toBe('k-test')
    const body = JSON.parse(init.body)
    expect(body).toMatchObject({ prompt: 'slow dolly in', image_url: 'https://r2.example/still.png', duration: 5, aspect_ratio: '9:16', webhook: cfg.webhookUrl })
  })

  it('submit() throws on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await expect(provider.submit({
      jobId: 'j', modelId: 'muapi/i2v-kling', mode: 'image-to-video', prompt: 'x',
      sourceAssetUrls: ['https://r2.example/s.png'], durationSeconds: 5, aspectRatio: '9:16', resolution: null,
    })).rejects.toThrow(/muapi submit failed: 401/)
  })

  it('poll() maps completed → succeeded with the output url', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: 'completed', outputs: ['https://cdn.muapi/out.mp4'], cost: 0.42 }),
    })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    const r = await provider.poll({ providerRequestId: 'req-123', status: 'submitted' })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.muapi.ai/api/v1/predictions/req-123/result')
    expect(r).toMatchObject({ status: 'succeeded', outputUrl: 'https://cdn.muapi/out.mp4', actualCostCents: 42 })
  })

  it('poll() maps processing → running and failed → failed', async () => {
    const running = makeMuapiProvider(cfg, (vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'processing' }) })) as any)
    expect(await running.poll({ providerRequestId: 'r', status: 's' })).toMatchObject({ status: 'running', outputUrl: null })
    const failed = makeMuapiProvider(cfg, (vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: 'failed', error: 'nsfw' }) })) as any)
    expect(await failed.poll({ providerRequestId: 'r', status: 's' })).toMatchObject({ status: 'failed', outputUrl: null, errorMessage: 'nsfw' })
  })

  it('poll() throws on a non-ok response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await expect(provider.poll({ providerRequestId: 'req-1', status: 'submitted' })).rejects.toThrow(/muapi poll failed: 500/)
  })

  it('submit() throws when the response has no request id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await expect(provider.submit({
      jobId: 'j', modelId: 'muapi/t2v-wan', mode: 'text-to-video', prompt: 'x',
      sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null,
    })).rejects.toThrow(/no request id/)
  })

  it('image_url is omitted for text-to-video', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ request_id: 'r' }) })
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await provider.submit({ jobId: 'j', modelId: 'muapi/t2v-wan', mode: 'text-to-video', prompt: 'a city at dusk', sourceAssetUrls: [], durationSeconds: 5, aspectRatio: '16:9', resolution: null })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.image_url).toBeUndefined()
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.muapi.ai/api/v1/generate_wan_t2v')
  })
})
