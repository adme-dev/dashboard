/* eslint-disable @typescript-eslint/no-explicit-any -- Partial H3/R2 runtime mocks isolate the bridge boundaries. */
import { describe, it, expect, vi } from 'vitest'
import { probeStoryboardMedia } from '../../server/utils/video-storyboard/mediaProbe'
import { handleMediaProbe } from '../../workers/audio-jobs/src/mediaProbe'

const input = { r2Key: 'video/source/a', expectedEtag: 'abc', expectedSize: 3 }
describe('private measured media bridge', () => {
  it('fails closed without service binding', async () => {
    await expect(
      probeStoryboardMedia(input, { event: { context: {} } as any })
    ).rejects.toThrow()
  })
  it('uses private binding and validates measured reply', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          kind: 'video',
          durationSeconds: 2,
          width: 16,
          height: 16
        })
      )
    expect(
      await probeStoryboardMedia(input, {
        event: {
          context: {
            cloudflare: { env: { STORYBOARD_MEDIA_PROBE: { fetch } } }
          }
        } as any
      })
    ).toEqual({ kind: 'video', durationSeconds: 2, width: 16, height: 16 })
    expect(fetch.mock.calls[0][0].url).toBe(
      'https://storyboard-media-probe.internal/probe'
    )
  })
  it('does not read changed objects', async () => {
    const get = vi.fn()
    const res = await handleMediaProbe(
      new Request('https://internal/probe', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
      {
        AUDIO_BUCKET: { head: async () => ({ etag: 'changed', size: 3 }), get },
        RENDER: {}
      } as any
    )
    expect(res.status).toBe(422)
    expect(get).not.toHaveBeenCalled()
  })
  it('rejects URL keys and oversized objects before R2', async () => {
    const head = vi.fn()
    for (const invalid of [
      { ...input, r2Key: 'https://evil/media' },
      { ...input, expectedSize: 100_000_000 }
    ]) {
      expect(
        (
          await handleMediaProbe(
            new Request('https://internal/probe', {
              method: 'POST',
              body: JSON.stringify(invalid)
            }),
            { AUDIO_BUCKET: { head } } as any
          )
        ).status
      ).toBe(422)
    }
    expect(head).not.toHaveBeenCalled()
  })
})

describe('R2 fingerprint race and decoded response boundaries', () => {
  it('uses conditional GET and forwards only matching private bytes', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({ kind: 'audio', durationSeconds: 1.5 })
      );
    (globalThis as any).__cloudflareContainersGetContainer = () => ({ fetch })
    const get = vi
      .fn()
      .mockResolvedValue({
        etag: 'abc',
        size: 3,
        body: new Response('abc').body
      })
    const response = await handleMediaProbe(
      new Request('https://internal/probe', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
      {
        AUDIO_BUCKET: { head: async () => ({ etag: 'abc', size: 3 }), get },
        RENDER: {}
      } as any
    )
    expect(response.status).toBe(200)
    expect(get).toHaveBeenCalledWith(input.r2Key, {
      onlyIf: { etagMatches: 'abc' }
    })
    expect(fetch.mock.calls[0][0]).toBe('http://container/probe')
    delete (globalThis as any).__cloudflareContainersGetContainer
  })
  it('rejects conditional GET without body after an overwrite', async () => {
    const fetch = vi.fn();
    (globalThis as any).__cloudflareContainersGetContainer = () => ({ fetch })
    const response = await handleMediaProbe(
      new Request('https://internal/probe', {
        method: 'POST',
        body: JSON.stringify(input)
      }),
      {
        AUDIO_BUCKET: {
          head: async () => ({ etag: 'abc', size: 3 }),
          get: async () => ({ etag: 'changed', size: 3 })
        },
        RENDER: {}
      } as any
    )
    expect(response.status).toBe(422)
    expect(fetch).not.toHaveBeenCalled()
    delete (globalThis as any).__cloudflareContainersGetContainer
  })
  it('rejects non-finite or missing durations from service', async () => {
    for (const result of [
      { kind: 'video', durationSeconds: null, width: 32, height: 24 },
      { kind: 'audio', durationSeconds: 0 }
    ]) {
      const fetch = vi.fn().mockResolvedValue(Response.json(result))
      await expect(
        probeStoryboardMedia(input, {
          event: {
            context: {
              cloudflare: { env: { STORYBOARD_MEDIA_PROBE: { fetch } } }
            }
          } as any
        })
      ).rejects.toThrow()
    }
  })
})
