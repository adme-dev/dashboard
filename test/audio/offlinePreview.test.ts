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

describe('renderPreview — ducking', () => {
  it('anchors then ramps the target bus, composing the duck with the bus nominal gain', async () => {
    const state = TimelineStateSchema.parse({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
        { id: 'mus', name: 'M', kind: 'music', gain_db: -6, clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    const o = makeOfflineCtor()
    const resolveBuffer = vi.fn(async () => stubBuffer)
    await renderPreview(state, resolveBuffer, o.ctor)
    // buses created in track order: gains[0]=vo, gains[1]=mus.
    // The offline pass applies ALL ramps (no windowing): down@0 then restore@5, so the
    // bus gets two setValueAtTime anchors — assert the FIRST (the down-ramp anchor).
    const musBus = o.gains[1]
    // down anchor: held nominal dbToGain(-6) ≈ 0.501187 at atSec 0
    const [held, anchorAt] = musBus.gain.setValueAtTime.mock.calls[0]
    expect(held).toBeCloseTo(0.501187, 5)
    expect(anchorAt).toBeCloseTo(0, 5)
    // down ramp to composed dbToGain(-18) ≈ 0.125893 at 0 + 0.05
    const [val, when] = musBus.gain.linearRampToValueAtTime.mock.calls[0]
    expect(val).toBeCloseTo(0.125893, 5)
    expect(when).toBeCloseTo(0.05, 5)
    // and the restore anchors at the ducked value before ramping back up
    const [restoreHeld] = musBus.gain.setValueAtTime.mock.calls[1]
    expect(restoreHeld).toBeCloseTo(0.125893, 5)
  })
})
