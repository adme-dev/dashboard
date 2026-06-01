import { describe, it, expect, vi, beforeEach } from 'vitest'

const getContainerMock = vi.fn()
vi.mock('@cloudflare/containers', () => ({ getContainer: (...a: any[]) => getContainerMock(...a) }))

import { renderVariants } from '../../workers/audio-jobs/src/renderVariants'

function fakeEnv(fetchImpl: any) {
  const put = vi.fn(async () => ({}))
  return {
    env: {
      RENDER: {},
      AUDIO_BUCKET: {
        get: vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(8) })),
        put,
      },
    } as any,
    put,
  }
}

beforeEach(() => getContainerMock.mockReset())

describe('renderVariants', () => {
  it('renders each channel via the container and uploads variants at channel keys', async () => {
    const fetch = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(16) }))
    getContainerMock.mockReturnValue({ fetch })
    const { env, put } = fakeEnv(fetch)

    const variants = await renderVariants(env, {
      clientId: 'c1', assetId: 'a1', masterKey: 'audio/c1/a1/master.mp3', channels: ['tiktok', 'radio'],
    })

    expect(variants).toEqual({ tiktok: 'audio/c1/a1/tiktok.mp3', radio: 'audio/c1/a1/radio.wav' })
    expect(put).toHaveBeenCalledTimes(2)
    expect(put.mock.calls.map(c => c[0])).toEqual(['audio/c1/a1/tiktok.mp3', 'audio/c1/a1/radio.wav'])
    // profile passed to the container as a header
    const headers = fetch.mock.calls[0][1].headers
    expect(JSON.parse(headers['x-audio-profile']).lufs).toBe(-14)
  })

  it('skips unknown channels without failing the batch', async () => {
    getContainerMock.mockReturnValue({ fetch: vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) })) })
    const { env } = fakeEnv(null)
    const variants = await renderVariants(env, {
      clientId: null, assetId: 'a1', masterKey: 'audio/org/a1/master.mp3', channels: ['tiktok', 'podcast'],
    })
    expect(Object.keys(variants)).toEqual(['tiktok'])
  })

  it('throws when the master is missing', async () => {
    const env: any = { RENDER: {}, AUDIO_BUCKET: { get: vi.fn(async () => null), put: vi.fn() } }
    await expect(renderVariants(env, { clientId: 'c1', assetId: 'a1', masterKey: 'missing', channels: ['meta'] }))
      .rejects.toThrow(/master not found/)
  })

  it('throws when the container render fails', async () => {
    getContainerMock.mockReturnValue({ fetch: vi.fn(async () => ({ ok: false, status: 500 })) })
    const { env } = fakeEnv(null)
    await expect(renderVariants(env, { clientId: 'c1', assetId: 'a1', masterKey: 'm', channels: ['meta'] }))
      .rejects.toThrow(/render meta failed: 500/)
  })
})
