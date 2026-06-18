import { describe, expect, it } from 'vitest'
import { addVideoClip, setClipEffects, setClipFit } from '~~/app/utils/audio/timelineEdit'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { CLIP_EFFECT_PRESETS } from '~~/server/utils/audio/videoCompositeGraph'
import { CLIP_EFFECT_PRESET_UI } from '~~/app/utils/video/clipEffectPresets'

function state() {
  return TimelineStateSchema.parse({
    schema_version: 2,
    media_type: 'av',
    tracks: [
      {
        id: 'vid',
        name: 'V',
        kind: 'video',
        clips: [{ type: 'video', id: 'v1', r2_key: 'm/f.mp4', timeline_start_sec: 0, duration_sec: 5, base_source: 'uploaded_footage' }]
      },
      {
        id: 'vo',
        name: 'VO',
        kind: 'voiceover',
        clips: [{ id: 'a1', r2_key: 'a/vo.mp3', timeline_start_sec: 0, source_out_sec: 5 }]
      }
    ]
  })
}

describe('setClipEffects', () => {
  it('replaces the effects on a video clip without mutating the input', () => {
    const before = state()
    const next = setClipEffects(before, { clipId: 'v1', effects: ['vhs', 'shake'] })
    const clip = next.tracks[0]!.clips[0]!
    expect(clip.type === 'video' && clip.effects).toEqual(['vhs', 'shake'])
    const original = before.tracks[0]!.clips[0]!
    expect(original.type === 'video' && original.effects).toEqual([])
  })

  it('returns the original reference for unknown clips (no-change detection)', () => {
    const before = state()
    expect(setClipEffects(before, { clipId: 'missing', effects: ['vhs'] })).toBe(before)
  })

  it('returns the original reference for non-video clips', () => {
    const before = state()
    expect(setClipEffects(before, { clipId: 'a1', effects: ['vhs'] })).toBe(before)
  })

  it('can clear effects back to empty', () => {
    const withFx = setClipEffects(state(), { clipId: 'v1', effects: ['bloom'] })
    const cleared = setClipEffects(withFx, { clipId: 'v1', effects: [] })
    const clip = cleared.tracks[0]!.clips[0]!
    expect(clip.type === 'video' && clip.effects).toEqual([])
  })
})

describe('setClipFit', () => {
  it('replaces the fit mode on a video clip without mutating the input', () => {
    const before = state()
    const next = setClipFit(before, { clipId: 'v1', fit: 'crop' })
    const clip = next.tracks[0]!.clips[0]!
    expect(clip.type === 'video' && clip.fit).toBe('crop')
    const original = before.tracks[0]!.clips[0]!
    expect(original.type === 'video' && original.fit).toBeUndefined()
  })

  it('returns the original reference for unknown clips and non-video clips', () => {
    const before = state()
    expect(setClipFit(before, { clipId: 'missing', fit: 'crop' })).toBe(before)
    expect(setClipFit(before, { clipId: 'a1', fit: 'crop' })).toBe(before)
  })

  it('defaults new footage to fit and stills to crop', () => {
    const footage = addVideoClip(state(), {
      trackId: 'vid',
      id: 'v2',
      r2Key: 'm/f2.mp4',
      startSec: 6,
      durationSec: 5,
      baseSource: 'uploaded_footage',
    })
    const still = addVideoClip(state(), {
      trackId: 'vid',
      id: 's1',
      r2Key: 'm/s1.png',
      startSec: 6,
      durationSec: 5,
      baseSource: 'still_kenburns',
    })
    expect((footage.tracks[0]!.clips[1] as any).fit).toBe('fit')
    expect((still.tracks[0]!.clips[1] as any).fit).toBe('crop')
  })
})

describe('clip effect preset UI catalog', () => {
  it('stays in sync with the render-side preset ids', () => {
    expect(CLIP_EFFECT_PRESET_UI.map(p => p.id).sort()).toEqual(Object.keys(CLIP_EFFECT_PRESETS).sort())
  })
})
