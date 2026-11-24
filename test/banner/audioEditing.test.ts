import { describe, expect, it } from 'vitest'
import { bannerAudioState } from '../../shared/bannerAudioClock'
import { buildBannerAudioManifest, readBannerAudioManifest, buildBannerAudioMixArgs } from '../../shared/bannerAudioRender.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const src = 'https://assets.example.com/tone.wav'
describe('audio clip editing clock', () => {
  it('trims from source time and repeats only the selected segment', () => {
    const clock = { mediaStart: 3, mediaEnd: 7, volume: 0.4 }
    expect(bannerAudioState(0, 8, clock, 60)).toEqual({ time: 3, active: true, volume: 0.4 })
    expect(bannerAudioState(5, 8, clock, 60)).toEqual({ time: 7, active: false, volume: 0.4 })
    expect(bannerAudioState(5, 8, { ...clock, loopAudio: true }, 60).time).toBe(4)
    expect(bannerAudioState(-1, 8, clock, 60).active).toBe(false)
    expect(bannerAudioState(8, 8, { ...clock, loopAudio: true }, 60).active).toBe(false)
  })
  it('applies live gain, mute and fades at the audible clip boundaries', () => {
    const clock = { volume: 0.8, audioFadeIn: 1, audioFadeOut: 2 }
    expect(bannerAudioState(0, 8, clock, 4).volume).toBe(0)
    expect(bannerAudioState(0.5, 8, clock, 4).volume).toBeCloseTo(0.4)
    expect(bannerAudioState(2, 8, clock, 4).volume).toBeCloseTo(0.8)
    expect(bannerAudioState(3, 8, clock, 4).volume).toBeCloseTo(0.4)
    expect(bannerAudioState(2, 8, { ...clock, muted: true }, 4).volume).toBe(0)
    expect(bannerAudioState(2, 8, { ...clock, volume: 0 }, 4).volume).toBe(0)
    expect(bannerAudioState(1, 2, { volume: 1, audioFadeIn: 2, audioFadeOut: 2 }, 2).volume).toBeCloseTo(0.25)
  })
  it('versions trim/fade exports, preserves legacy manifests and rejects invalid settings', () => {
    const html = '<audio></audio>' + buildBannerAudioManifest([{ type: 'audio', src, startTime: 0, endTime: 8, mediaStart: 3, mediaEnd: 7, audioFadeIn: 0.5, audioFadeOut: 1 }])
    expect(html).toContain('"version":2')
    expect(readBannerAudioManifest(html)[0]).toMatchObject({ mediaStart: 3, mediaEnd: 7, audioFadeIn: 0.5, audioFadeOut: 1 })
    for (const patch of [{ mediaStart: -1 }, { mediaStart: 7, mediaEnd: 3 }, { audioFadeIn: '1' }, { audioFadeOut: Infinity }]) {
      const bad = `<audio></audio><script type="application/json" id="banner-audio">${JSON.stringify({ version: 2, tracks: [{ src, start: 0, end: 8, volume: 1, loop: false, ...patch }] })}</script>`
      expect(() => readBannerAudioManifest(bad)).toThrow(/trim|fade/)
    }
    const legacy = '<audio></audio>' + buildBannerAudioManifest([{ type: 'audio', src, startTime: 0, endTime: 8 }])
    expect(legacy).toContain('"version":1')
    expect(readBannerAudioManifest(legacy)[0]).toEqual({ src, start: 0, end: 8, volume: 1, loop: false })
  })
})

const available = spawnSync('ffmpeg', ['-version'], { timeout: 5000 }).status === 0
it.skipIf(!available)('renders the selected source interval, repeated clip, real volume and both fades into AAC', () => {
  const dir = mkdtempSync(join(tmpdir(), 'banner-audio-edit-'))
  const run = (args: string[]) => {
    const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-filter_complex_threads', '1', '-y', ...args], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 })
    expect(result.status, result.stderr.toString()).toBe(0)
    return result.stdout
  }
  const rms = (bytes: Buffer, start: number, end: number) => {
    let sum = 0
    const from = Math.round(start * 48000), to = Math.round(end * 48000)
    for (let i = from; i < to; i++) sum += bytes.readFloatLE(i * 4) ** 2
    return Math.sqrt(sum / (to - from))
  }
  try {
    const source = join(dir, 'source.wav'), out = join(dir, 'out.mp4')
    // Silence surrounds the chosen one-second tone, so a full-file loop is detectably wrong.
    run(['-f', 'lavfi', '-i', 'aevalsrc=if(between(t\\,1\\,2)\\,0.5*sin(2*PI*440*t)\\,0):s=48000:d=3', source])
    const render = (volume: number, fades = false) => {
      const mix = buildBannerAudioMixArgs([{ src, start: 0, end: 3, volume, loop: true, mediaStart: 1, mediaEnd: 2, ...(fades ? { audioFadeIn: 0.5, audioFadeOut: 0.5 } : {}) }], [source], 3)
      run(['-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=12:d=3', ...mix.inputs, ...mix.output, '-c:v', 'libx264', '-t', '3', out])
      return run(['-i', out, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
    }
    const full = render(1), quiet = render(0.25), faded = render(1, true)
    expect(rms(full, 0.1, 0.3)).toBeGreaterThan(0.25)
    expect(rms(full, 2.1, 2.3)).toBeGreaterThan(0.25)
    expect(rms(quiet, 1.2, 1.4) / rms(full, 1.2, 1.4)).toBeCloseTo(0.25, 1)
    expect(rms(faded, 0.02, 0.08) / rms(full, 0.02, 0.08)).toBeLessThan(0.2)
    expect(rms(faded, 2.92, 2.98) / rms(full, 2.92, 2.98)).toBeLessThan(0.2)
    expect(rms(faded, 1.2, 1.4) / rms(full, 1.2, 1.4)).toBeCloseTo(1, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
