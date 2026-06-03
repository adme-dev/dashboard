import { describe, it, expect, vi } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { renderPreview } from '~~/app/utils/audio/offlinePreview'

const stubBuffer = { duration: 10, length: 480000, numberOfChannels: 2, sampleRate: 48000 } as any

function makeOfflineCtor() {
  const gains: any[] = []
  const sources: any[] = []
  const rendered = { id: 'rendered-buffer' } as any
  const ctor: any = vi.fn(function (this: any) {
    this.currentTime = 0
    this.destination = { id: 'dest' }
    this.createGain = () => { const g = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn() }; gains.push(g); return g }
    this.createBufferSource = () => { const s = { buffer: null, connect: vi.fn(), start: vi.fn() }; sources.push(s); return s }
    this.startRendering = vi.fn(async () => rendered)
  })
  return { ctor, gains, sources, rendered }
}

describe('renderPreview', () => {
  it('schedules the timeline into an OfflineAudioContext and returns the rendered buffer', async () => {
    const state = TimelineStateSchema.parse({
      tracks: [{ id: 'mus', name: 'M', kind: 'music', clips: [
        { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 8 } ] }],
      ducking: []
    })
    const o = makeOfflineCtor()
    const resolveBuffer = vi.fn(async () => stubBuffer)
    const out = await renderPreview(state, resolveBuffer, o.ctor)
    expect(out).toBe(o.rendered)
    expect(o.sources).toHaveLength(1)        // the one clip scheduled offline
    expect(o.sources[0].start).toHaveBeenCalled()
    expect(o.gains.length).toBeGreaterThanOrEqual(1) // a track bus
  })
})
