import { describe, expect, it } from 'vitest'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { buildBannerAudioManifest, readBannerAudioManifest, buildBannerAudioMixArgs } from '../../shared/bannerAudioRender.mjs'
import { isPublicAudioAddress, resolveAudioDownloadUrl } from '../../workers/audio-jobs/container/bannerAudioDownload.mjs'

const track = { src: 'https://assets.example.com/tone.wav', start: 0.5, end: 2.5, volume: 0.5, loop: false }

describe('banner soundtrack contract', () => {
  it('keeps container and app contract identical', () => {
    expect(readFileSync('workers/audio-jobs/container/bannerAudioRender.mjs', 'utf8')).toBe(readFileSync('shared/bannerAudioRender.mjs', 'utf8'))
  })
  it('retains timing, mute and looping, and safely serializes source attributes', () => {
    const html = '<audio></audio>' + buildBannerAudioManifest([{ type: 'audio', src: track.src + '?x=</script>', startTime: 0.5, endTime: 2.5, volume: 0.25, muted: true, loopAudio: true }])
    expect(html).not.toContain('?x=</script>')
    expect(readBannerAudioManifest(html)).toEqual([{ ...track, src: track.src + '?x=</script>', volume: 0, loop: true }])
  })
  it('fails closed on legacy audio, missing tracks, unsafe URLs and invalid timing', () => {
    expect(readBannerAudioManifest('<div></div>')).toEqual([])
    expect(() => readBannerAudioManifest('<audio src="a"></audio>')).toThrow(/Regenerate/)
    for (const patch of [{ src: 'file:///etc/passwd' }, { src: 'https://user:pass@example.com/a' }, { start: -1 }, { end: 0 }, { volume: 2 }, { start: '1' }, { loop: 'yes' }]) {
      const html = `<audio></audio><script type="application/json" id="banner-audio">${JSON.stringify({ version: 1, tracks: [{ ...track, ...patch }] })}</script>`
      expect(() => readBannerAudioManifest(html)).toThrow()
    }
    expect(() => readBannerAudioManifest(buildBannerAudioManifest([{ type: 'audio', src: track.src, startTime: 0, endTime: 1 }]))).toThrow(/does not match/)
  })
  it('blocks private, mapped, metadata and mixed DNS results', async () => {
    for (const address of ['127.0.0.1', '10.2.3.4', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', '224.0.0.1', '0.0.0.0']) expect(isPublicAudioAddress(address)).toBe(false)
    expect(isPublicAudioAddress('1.1.1.1')).toBe(true)
    await expect(resolveAudioDownloadUrl(track.src, async () => [{ address: '1.1.1.1' }, { address: '10.0.0.1' }])).rejects.toThrow(/public/)
    await expect(resolveAudioDownloadUrl('http://example.com/a')).rejects.toThrow(/HTTPS/)
  })
})

const ffmpegAvailable = spawnSync('ffmpeg', ['-version'], { timeout: 5000 }).status === 0
// Decode the actual AAC output: catches trim/delay/loop/volume errors that argv assertions miss.
it.skipIf(!ffmpegAvailable)('muxes AAC with exact silence, onset, volume, overlapping tracks, looping and end time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'banner-audio-test-'))
  const run = (args: string[]) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-filter_complex_threads', '1', '-threads', '1', '-y', ...args], { timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 8 * 1024 * 1024 })
    expect(r.status, r.stderr.toString()).toBe(0)
    return r.stdout
  }
  try {
    const tone = join(dir, 'tone.wav'), out = join(dir, 'mix.mp4')
    run(['-f', 'lavfi', '-i', 'sine=frequency=1000:duration=0.25:sample_rate=48000', tone])
    const tracks = [{ ...track, loop: true, end: 1.5 }, { ...track, start: 1, end: 2, volume: 0.25, loop: true }]
    const mix = buildBannerAudioMixArgs(tracks, [tone, tone], 3)
    run(['-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=12:d=3', ...mix.inputs, ...mix.output, '-c:v', 'libx264', '-t', '3', out])
    const bytes = run(['-i', out, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
    const rms = (start: number, end: number) => {
      let sum = 0, n = 0
      for (let i = Math.round(start * 48000); i < Math.round(end * 48000); i++) { sum += bytes.readFloatLE(i * 4) ** 2; n++ }
      return Math.sqrt(sum / n)
    }
    expect(bytes.length / 4 / 48000).toBeCloseTo(3, 1)
    expect(rms(0.1, 0.4)).toBeLessThan(0.0001)
    const half = rms(0.7, 0.9) // past the source EOF: must loop
    expect(half).toBeGreaterThan(0.025)
    expect(rms(1.2, 1.4) / half).toBeCloseTo(1.5, 1)
    expect(rms(1.7, 1.9) / half).toBeCloseTo(0.5, 1)
    expect(rms(2.2, 2.8)).toBeLessThan(0.0001)
    const noLoop = buildBannerAudioMixArgs([{ ...track, volume: 1 }], [tone], 3)
    run(['-f', 'lavfi', '-i', 'color=c=black:s=32x32:r=12:d=3', ...noLoop.inputs, ...noLoop.output, '-c:v', 'libx264', '-t', '3', out])
    const plain = run(['-i', out, '-vn', '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1'])
    expect(Math.abs(plain.readFloatLE(48000 * 4))).toBeLessThan(0.0001)
  } finally { rmSync(dir, { recursive: true, force: true }) }
}, 30000)
