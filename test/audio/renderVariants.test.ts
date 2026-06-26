import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderVariants, type RenderEnv } from '../../workers/audio-jobs/src/renderVariants'

type ContainerStub = {
  fetch: ReturnType<typeof vi.fn>
}

type ContainerTestGlobal = typeof globalThis & {
  __cloudflareContainersGetContainer?: (...args: unknown[]) => ContainerStub
}

const getContainerMock = vi.fn<(...args: unknown[]) => ContainerStub>()

function fakeEnv() {
  const put = vi.fn<RenderEnv['AUDIO_BUCKET']['put']>(async () => ({}))
  const env: RenderEnv = {
    RENDER: {},
    AUDIO_BUCKET: {
      get: vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
      put
    }
  }
  return {
    env,
    put
  }
}

beforeEach(() => {
  getContainerMock.mockReset()
  ;(globalThis as ContainerTestGlobal).__cloudflareContainersGetContainer = getContainerMock
})

describe('renderVariants', () => {
  it('renders each channel via the container and uploads variants at channel keys', async () => {
    const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }))
    getContainerMock.mockReturnValue({ fetch })
    const { env, put } = fakeEnv()

    const variants = await renderVariants(env, {
      clientId: 'c1', assetId: 'a1', masterKey: 'audio/c1/a1/master.mp3', channels: ['tiktok', 'radio']
    })

    expect(variants).toEqual({ tiktok: 'audio/c1/a1/tiktok.mp3', radio: 'audio/c1/a1/radio.wav' })
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls.map(c => c[0])).toEqual(['audio/c1/a1/tiktok.mp3', 'audio/c1/a1/radio.wav'])
    // profile passed to the container as a header
    const headers = (fetch.mock.calls[0][1] as { headers: Record<string, string> }).headers
    expect(JSON.parse(headers['x-audio-profile']).lufs).toBe(-14)
  })

  it('skips unknown channels without failing the batch', async () => {
    getContainerMock.mockReturnValue({ fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })) })
    const { env } = fakeEnv()
    const variants = await renderVariants(env, {
      clientId: null, assetId: 'a1', masterKey: 'audio/org/a1/master.mp3', channels: ['tiktok', 'podcast']
    })
    expect(Object.keys(variants)).toEqual(['tiktok'])
  })

  it('throws when the master is missing', async () => {
    const env: RenderEnv = { RENDER: {}, AUDIO_BUCKET: { get: vi.fn(async () => null), put: vi.fn() } }
    await expect(renderVariants(env, { clientId: 'c1', assetId: 'a1', masterKey: 'missing', channels: ['meta'] }))
      .rejects.toThrow(/master not found/)
  })

  it('throws when the container render fails', async () => {
    getContainerMock.mockReturnValue({ fetch: vi.fn(async () => ({ ok: false, status: 500 })) })
    const { env } = fakeEnv()
    await expect(renderVariants(env, { clientId: 'c1', assetId: 'a1', masterKey: 'm', channels: ['meta'] }))
      .rejects.toThrow(/render meta failed: 500/)
  })
})
