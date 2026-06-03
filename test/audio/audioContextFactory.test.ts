import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeR2Resolver } from '~~/app/utils/audio/audioContextFactory'

const stubBuffer = { duration: 10, length: 480000, numberOfChannels: 2, sampleRate: 48000 } as any
function clip(over: any = {}) {
  return { clipId: 'c1', trackId: 't1', r2_key: 'k/a', timelineStartSec: 0, sourceInSec: 0,
    durationSec: 10, gainDb: 0, fadeInSec: 0, fadeOutSec: 0, fadeCurve: 'linear', ...over }
}

beforeEach(() => vi.restoreAllMocks())

describe('makeR2Resolver', () => {
  it('fetches the presigned URL, reads the arrayBuffer, and decodes it', async () => {
    const ab = new ArrayBuffer(8)
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => ab }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = { decodeAudioData: vi.fn(async () => stubBuffer) }
    const resolve = makeR2Resolver(new Map([['k/a', 'https://signed/k/a']]), ctx as any)
    const buf = await resolve(clip())
    expect(buf).toBe(stubBuffer)
    expect(fetchMock).toHaveBeenCalledWith('https://signed/k/a')
    expect(ctx.decodeAudioData).toHaveBeenCalledWith(ab)
  })

  it('rejects when the clip key is missing from the sources map', async () => {
    const ctx = { decodeAudioData: vi.fn() }
    const resolve = makeR2Resolver(new Map(), ctx as any)
    await expect(resolve(clip({ r2_key: 'k/missing' }))).rejects.toThrow(/k\/missing/)
    expect(ctx.decodeAudioData).not.toHaveBeenCalled()
  })

  it('rejects on a non-ok fetch response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) })))
    const ctx = { decodeAudioData: vi.fn() }
    const resolve = makeR2Resolver(new Map([['k/a', 'https://signed/k/a']]), ctx as any)
    await expect(resolve(clip())).rejects.toThrow(/403/)
  })

  it('caches by r2_key — two clips sharing a key fetch+decode once', async () => {
    const ab = new ArrayBuffer(8)
    const fetchMock = vi.fn(async () => ({ ok: true, arrayBuffer: async () => ab }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = { decodeAudioData: vi.fn(async () => stubBuffer) }
    const resolve = makeR2Resolver(new Map([['k/a', 'https://signed/k/a']]), ctx as any)
    const [b1, b2] = await Promise.all([resolve(clip({ clipId: 'c1' })), resolve(clip({ clipId: 'c2' }))])
    expect(b1).toBe(stubBuffer); expect(b2).toBe(stubBuffer)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1)
  })

  it('picks up a URL merged after resolver creation (live-map behavior)', async () => {
    const ab = new ArrayBuffer(8)
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, arrayBuffer: async () => ab })))
    const ctx = { decodeAudioData: vi.fn(async () => stubBuffer) }
    const liveMap = new Map<string, string>()
    const resolve = makeR2Resolver(liveMap, ctx as any)
    // key missing at creation time → merge it in after
    liveMap.set('k/a', 'https://signed/k/a')
    const buf = await resolve(clip())
    expect(buf).toBe(stubBuffer)
  })
})
