import { describe, expect, it, vi } from 'vitest'
import type { Layer } from '../../app/types/banner-studio'
import { selectReelmotionBaseFootage, resolveReelmotionBaseFootage } from '../../server/utils/audio/reelmotionBaseFootage'

function fixture() {
  const duration = 40.18
  const curve = [{ time: 0, value: 1, easing: 'linear' }, { time: 4.679, value: 1.05, easing: 'linear' }, { time: 4.68, value: 1, easing: 'linear' }, { time: 40.179, value: 1.05, easing: 'linear' }]
  const video = { id: 3, type: 'video', name: 'Footage', src: 'https://assets.example/footage.mp4', x: 0, y: 0, w: 1080, h: 1920, zIndex: 3, opacity: 1, startTime: 0, endTime: duration, fit: 'cover', animIn: 'none', animOut: 'none', transformOrigin: { x: 540, y: 960 }, keyframes: { scaleX: curve, scaleY: structuredClone(curve), opacity: [{ time: 0, value: 1 }, { time: duration, value: 1 }] } } as Layer
  const layers = [{ id: 1, type: 'bg', zIndex: 1 }, { id: 2, type: 'audio', zIndex: 2 }, video, { id: 4, type: 'text', zIndex: 4, text: 'Reviewed copy', keyframes: { opacity: [{ time: 0, value: 0 }, { time: 2, value: 1 }] } }] as Layer[]
  return { format: 'reels_9x16', width: 1080, height: 1920, duration, playback: { duration, loopCount: 0 }, layers, clip: { id: 'overlay', gsap_project_id: 'banner', timeline_start_sec: 0, duration_sec: duration }, timeline: { media_type: 'av', width: 1080, height: 1920, duration_sec: duration, tracks: [{ kind: 'overlay', clips: [{ id: 'overlay', type: 'overlay' }] }, { kind: 'voiceover', clips: [{ type: 'audio' }] }] } }
}

describe('bounded ReelMotion footage split', () => {
  it('preserves paired authored zoom resets and all upper graphic objects', () => {
    const input = fixture()
    const result = selectReelmotionBaseFootage(input as never)!
    expect(result.video.id).toBe(3)
    expect(result.graphics).toEqual([input.layers[3]])
    expect(result.graphics[0]).toBe(input.layers[3])
    expect(result.zoom).toEqual(input.layers[2].keyframes!.scaleX!.map(frame => ({ timeSec: frame.time, scale: frame.value })))
    expect(input.layers).toHaveLength(4)
  })
  it('retains whole-artwork capture for unsupported visual/timing/zoom changes', () => {
    const changes = [
      (x: ReturnType<typeof fixture>) => { x.format = 'square_1x1' },
      (x: ReturnType<typeof fixture>) => { x.clip.timeline_start_sec = 1 },
      (x: ReturnType<typeof fixture>) => { x.clip['placement'] = { x: 1 } },
      (x: ReturnType<typeof fixture>) => { x.clip['opacity'] = 0.8 },
      (x: ReturnType<typeof fixture>) => {
        x.layers[0].isMask = true
        x.layers[0].maskTargetIds = [4]
      },
      (x: ReturnType<typeof fixture>) => { x.layers[0].slideTransitionFor = 'scene' },
      (x: ReturnType<typeof fixture>) => { x.layers[3].id = 3 },
      (x: ReturnType<typeof fixture>) => { x.layers[2].keyframes = {} },
      (x: ReturnType<typeof fixture>) => { delete x.layers[2].keyframes },
      (x: ReturnType<typeof fixture>) => { x.timeline.tracks.push({ kind: 'caption', clips: [{ type: 'caption' }] } as never) },
      (x: ReturnType<typeof fixture>) => {
        x.layers[2].keyframes!.scaleX = Array.from({ length: 65 }, (_, i) => ({ time: i / 2, value: 1, easing: 'linear' }))
        x.layers[2].keyframes!.scaleY = structuredClone(x.layers[2].keyframes!.scaleX)
      },
      (x: ReturnType<typeof fixture>) => { x.layers[2].mediaLoop = true },
      (x: ReturnType<typeof fixture>) => { x.layers[2].rotation = 1 },
      (x: ReturnType<typeof fixture>) => { x.layers[2].transformOrigin = { x: 0, y: 0 } },
      (x: ReturnType<typeof fixture>) => { x.layers[2].keyframes!.scaleX![1].easing = 'power2.out' },
      (x: ReturnType<typeof fixture>) => { x.layers[2].keyframes!.scaleY![1].value = 1.1 },
      (x: ReturnType<typeof fixture>) => { x.layers[2].keyframes!.opacity![1].value = 0 },
      (x: ReturnType<typeof fixture>) => { x.layers[3].mixBlendMode = 'multiply' },
      (x: ReturnType<typeof fixture>) => {
        x.layers[3].isMask = true
        x.layers[3].maskTargetIds = [3]
      },
      (x: ReturnType<typeof fixture>) => { x.timeline.tracks.push({ kind: 'video', clips: [{ type: 'video' }] } as never) },
      (x: ReturnType<typeof fixture>) => { x.layers[2].keyframes!.scaleX![1].value = Number.NaN }
    ]
    for (const change of changes) {
      const input = fixture()
      change(input)
      expect(selectReelmotionBaseFootage(input as never)).toBeNull()
    }
  })
  it('resolves only the exact client-owned managed URL and pins metadata', async () => {
    const query = vi.fn(async (_sql: string, _args: string[]) => ({ r2Key: 'banner-assets/actor/source.mp4', clientId: 'client-a', mimeType: 'video/mp4' }))
    const metadata = vi.fn(async () => ({ size: 100, etag: '"etag"', contentType: 'video/mp4' }))
    const input = { clientId: 'client-a', bannerId: 'banner', src: 'https://assets.example/footage.mp4', graphicsHtmlKey: 'media/project/job/reels_9x16/overlay-clip-graphics.html', zoom: [{ timeSec: 0, scale: 1 }] }
    const result = await resolveReelmotionBaseFootage(input, { query, metadata } as never)
    expect(result?.source).toEqual({ r2Key: 'banner-assets/actor/source.mp4', size: 100, etag: 'etag' })
    expect(query.mock.calls[0][0]).toContain('source:reelmotion')
    expect(query.mock.calls[0][1]).toEqual(['banner', 'client-a', input.src])
    expect(metadata).toHaveBeenCalledWith('banner-assets/actor/source.mp4')
    query.mockResolvedValueOnce({ r2Key: 'banner-assets/actor/source.mp4', clientId: 'other', mimeType: 'video/mp4' })
    expect(await resolveReelmotionBaseFootage(input, { query, metadata } as never)).toBeNull()
    query.mockResolvedValueOnce({ r2Key: '../another/source.mp4', clientId: 'client-a', mimeType: 'video/mp4' })
    expect(await resolveReelmotionBaseFootage(input, { query, metadata } as never)).toBeNull()
    metadata.mockResolvedValueOnce({ size: 16 * 1024 * 1024 + 1, etag: 'etag', contentType: 'video/mp4' })
    expect(await resolveReelmotionBaseFootage(input, { query, metadata } as never)).toBeNull()
    metadata.mockResolvedValueOnce({ size: 100, etag: '', contentType: 'video/mp4' })
    expect(await resolveReelmotionBaseFootage(input, { query, metadata } as never)).toBeNull()
  })
})
