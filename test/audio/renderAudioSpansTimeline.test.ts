import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { buildCompositePlan, buildCompositeRenderArgs } from '~~/server/utils/audio/videoCompositeGraph'

const profile = videoFormatFor('square_1x1')!
// A 30 s storyboard-shaped timeline whose only audio is a 5 s music cue at 0 s.
function state() {
  return TimelineStateSchema.parse({ schema_version: 2, media_type: 'av', tracks: [
    { id: 'vid', name: 'V', kind: 'video', clips: [
      { type: 'video', id: 'v1', r2_key: 'm/still.mp4', timeline_start_sec: 0, duration_sec: 30, base_source: 'uploaded_footage', audio_mode: 'mute' }
    ] },
    { id: 'mus', name: 'Music', kind: 'music', clips: [
      { id: 'tone', r2_key: 'a/tone.wav', timeline_start_sec: 0, source_in_sec: 0, source_out_sec: 5 }
    ] }
  ] })
}

describe('rendered audio spans the whole timeline', () => {
  it('pads and trims the mixed audio to the timeline duration in the filtergraph', () => {
    const plan = buildCompositePlan(state(), profile)
    expect(plan.durationSec).toBe(30)
    expect(plan.filterComplex).toContain('[mixraw]apad=whole_dur=30.000,atrim=end=30.000,asetpts=N/SR/TB[aout]')
    expect(plan.aLabel).toBe('[aout]')
  })

  const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0
  it.skipIf(!ffmpeg)('produces an audio stream as long as the video when the only cue is shorter (real ffmpeg)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-audio-span-'))
    try {
      const video = join(dir, 'still.mp4')
      const tone = join(dir, 'tone.wav')
      const out = join(dir, 'out.mp4')
      execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=gray:s=64x64:r=30:d=30', '-pix_fmt', 'yuv420p', '-y', video])
      execFileSync('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=30', '-y', tone])
      const plan = buildCompositePlan(state(), { ...profile, width: 64, height: 64, videoBitrate: '200k' })
      const args = buildCompositeRenderArgs(plan, [video, tone], out)
      execFileSync('ffmpeg', args.map(arg => (arg === '-nostats' ? '-nostats' : arg)), { stdio: 'pipe' })
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,duration', '-of', 'json', out], { encoding: 'utf8' }))
      const durations = Object.fromEntries(probe.streams.map((s: { codec_type: string, duration: string }) => [s.codec_type, Number(s.duration)]))
      expect(durations.video).toBeCloseTo(30, 1)
      expect(durations.audio).toBeGreaterThan(29.9)
      expect(durations.audio).toBeLessThan(30.1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 120_000)
})
