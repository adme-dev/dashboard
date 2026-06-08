import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { createAudioEngine } from '~~/app/composables/useAudioEngine'

// Mock Web Audio: spy gain/source nodes + a controllable currentTime.
function makeMockCtx() {
  let t = 0
  const gains: any[] = []
  const sources: any[] = []
  const ctx: any = {
    get currentTime() { return t },
    destination: { id: 'dest' },
    state: 'suspended',
    resume: vi.fn(async () => { ctx.state = 'running' }),
    createGain() {
      const g = { gain: { value: 1, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
      gains.push(g); return g
    },
    createBufferSource() {
      const s = { buffer: null as any, connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn(), onended: null }
      sources.push(s); return s
    }
  }
  return { ctx, gains, sources, advance: (to: number) => { t = to } }
}

// Fake timer: capture the latest callback so the test can pump ticks deterministically.
function makeFakeTimer() {
  let cb: (() => void) | null = null
  const setTimer = (fn: () => void) => { cb = fn; return () => { cb = null } }
  return { setTimer, tick: () => { const f = cb; cb = null; f && f() } }
}

const stubBuffer = { duration: 30, length: 1440000, numberOfChannels: 2, sampleRate: 48000 } as any

function makeEngine(state: any, over: any = {}) {
  const m = makeMockCtx()
  const timer = makeFakeTimer()
  const resolveBuffer = vi.fn(async () => stubBuffer)
  const engine = createAudioEngine({
    ctx: m.ctx, resolveBuffer, setTimer: timer.setTimer, now: () => 0, ...over
  })
  return { engine, ...m, timer, resolveBuffer }
}

const oneClip = TimelineStateSchema.parse({
  tracks: [{ id: 'mus', name: 'M', kind: 'music', clips: [
    { id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 10 } ] }],
  ducking: []
})

// Two clips on one track; 'dead' references a key whose source can't be fetched.
const twoClips = TimelineStateSchema.parse({
  tracks: [{ id: 'mus', name: 'M', kind: 'music', clips: [
    { id: 'good', r2_key: 'k/good', timeline_start_sec: 0, source_out_sec: 10 },
    { id: 'dead', r2_key: 'k/dead', timeline_start_sec: 0, source_out_sec: 5 } ] }],
  ducking: []
})

beforeEach(() => vi.clearAllMocks())

describe('createAudioEngine — load', () => {
  it('creates one gain bus per track and pre-resolves clip buffers', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    expect(h.gains).toHaveLength(1)            // one track bus
    expect(h.gains[0].connect).toHaveBeenCalledWith(h.ctx.destination)
    expect(h.resolveBuffer).toHaveBeenCalledTimes(1)
    expect(h.engine.duration()).toBe(10)
  })

  it('returns no missing clip ids when every buffer resolves', async () => {
    const h = makeEngine(oneClip)
    const result = await h.engine.load(oneClip)
    expect(result.missingClipIds).toEqual([])
  })
})

describe('createAudioEngine — load tolerates a missing clip source', () => {
  // A deleted R2 object (404) makes resolveBuffer reject for that clip. The load
  // must NOT abort — the project has to stay openable so the user can remove the
  // dead clip — so the bad clip is skipped and reported instead.
  function deadResolver() {
    return vi.fn(async (clip: any) => {
      if (clip.r2_key === 'k/dead') throw new Error('Fetch failed (404) for k/dead')
      return stubBuffer
    })
  }

  it('skips the unresolvable clip, loads the rest, and reports it', async () => {
    const h = makeEngine(twoClips, { resolveBuffer: deadResolver() })
    const result = await h.engine.load(twoClips)   // must not throw
    expect(result.missingClipIds).toEqual(['dead'])
    expect(h.engine.duration()).toBe(10)           // only the good clip contributes
    expect(h.engine.clipSourceDuration('good')).toBe(stubBuffer.duration)
    expect(h.engine.clipSourceDuration('dead')).toBe(0)
  })

  it('only the resolved clip is scheduled on play (the dead clip is silent)', async () => {
    const h = makeEngine(twoClips, { resolveBuffer: deadResolver() })
    await h.engine.load(twoClips)
    h.engine.play()
    h.timer.tick()
    expect(h.sources).toHaveLength(1)
  })
})

describe('createAudioEngine — play schedules due clips', () => {
  it('resumes ctx and starts the clip at its timeline time on the first tick', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    h.engine.play()
    expect(h.ctx.resume).toHaveBeenCalled()
    h.timer.tick() // first lookahead tick at currentTime 0
    expect(h.sources).toHaveLength(1)
    // start(when, offset, duration): when = ctxStart(0) + clipStart(0) = 0, offset 0, dur 10
    expect(h.sources[0].start).toHaveBeenCalledWith(0, 0, 10)
    expect(h.engine.isPlaying()).toBe(true)
  })

  it('does not re-schedule an already-scheduled clip on a later tick', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    h.engine.play()
    h.timer.tick()            // schedules clip b (start 0, within [0,0.1))
    h.advance(0.05)
    h.timer.tick()            // window moves to [0.1,...); clip b not re-scheduled
    expect(h.sources).toHaveLength(1)
  })
})

describe('createAudioEngine — ducking ramp on the target bus', () => {
  it('anchors then ramps the target bus, composing the duck with the bus nominal gain', async () => {
    const ducked = TimelineStateSchema.parse({
      tracks: [
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [{ id: 'a', r2_key: 'k/a', timeline_start_sec: 0, source_out_sec: 5 }] },
        // music bus nominal gain -6 dB → duck delta -12 dB must land at -18 dB, not -12 dB
        { id: 'mus', name: 'M', kind: 'music', gain_db: -6, clips: [{ id: 'b', r2_key: 'k/b', timeline_start_sec: 0, source_out_sec: 30 }] }
      ],
      ducking: [{ id: 'd1', source_track_id: 'vo', target_track_id: 'mus', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    })
    const h = makeEngine(ducked)
    await h.engine.load(ducked)
    // buses created in track order: gains[0]=vo, gains[1]=mus
    const musBus = h.gains[1]
    h.engine.play()
    h.timer.tick() // window [0,0.1): down ramp at atSec 0 on mus bus
    // anchor: hold the bus's current (nominal) gain dbToGain(-6) ≈ 0.501187 at ctxStart+atSec = 0
    expect(musBus.gain.setValueAtTime).toHaveBeenCalled()
    const [held, anchorAt] = musBus.gain.setValueAtTime.mock.calls.at(-1)!
    expect(held).toBeCloseTo(0.501187, 5)
    expect(anchorAt).toBeCloseTo(0, 5)
    // ramp: to dbToGain(-6 + -12) = dbToGain(-18) ≈ 0.125893 at 0 + 0.05
    expect(musBus.gain.linearRampToValueAtTime).toHaveBeenCalled()
    const [val, when] = musBus.gain.linearRampToValueAtTime.mock.calls[0]
    expect(val).toBeCloseTo(0.125893, 5)
    expect(when).toBeCloseTo(0.05, 5)
  })
})

describe('createAudioEngine — transport', () => {
  it('seek sets currentTime; pause stops sources and freezes position', async () => {
    const h = makeEngine(oneClip)
    await h.engine.load(oneClip)
    h.engine.play(); h.timer.tick()
    h.advance(3)
    h.engine.pause()
    expect(h.sources[0].stop).toHaveBeenCalled()
    expect(h.engine.isPlaying()).toBe(false)
    expect(h.engine.currentTime()).toBeCloseTo(3, 5)
    h.engine.seek(7)
    expect(h.engine.currentTime()).toBe(7)
  })
})
