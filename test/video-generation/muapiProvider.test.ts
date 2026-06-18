import { describe, expect, it, vi } from 'vitest'
import { makeMuapiProvider } from '~~/server/utils/video-generation/providers/muapiProvider'

const cfg = { apiKey: 'k-test', baseUrl: 'https://api.muapi.ai/api/v1', webhookUrl: 'https://app.example/api/agency/video/generation/webhook' }

describe('muapi provider', () => {
  it('submit() is unreachable without a registered MuAPI model mapping', async () => {
    const fetchMock = vi.fn()
    const provider = makeMuapiProvider(cfg, fetchMock as any)
    await expect(provider.submit({
      jobId: 'job-1', modelId: 'muapi/i2v-kling', mode: 'image-to-video',
      prompt: 'slow dolly in', sourceAssetUrls: ['https://r2.example/still.png'],
      durationSeconds: 5, aspectRatio: '9:16', resolution: '720p',
    })).rejects.toThrow(/muapi endpoint not configured/)
    expect(fetchMock).not.toHaveBeenCalled()
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

})
