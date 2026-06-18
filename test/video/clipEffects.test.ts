import { describe, expect, it } from 'vitest'
import { clipEffectFilters, CLIP_EFFECT_PRESETS, buildCompositePlan, resolveVideoClipFit, videoClipFitFilters } from '~~/server/utils/audio/videoCompositeGraph'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'

const profile = videoFormatFor('reels_9x16')!

function avState(effects?: string[]) {
  return TimelineStateSchema.parse({
    schema_version: 2,
    media_type: 'av',
    tracks: [{
      id: 'vid',
      name: 'V',
      kind: 'video',
      clips: [{
        type: 'video',
        id: 'f1',
        r2_key: 'm/f.mp4',
        timeline_start_sec: 0,
        duration_sec: 5,
        base_source: 'uploaded_footage',
        ...(effects ? { effects } : {})
      }]
    }]
  })
}

describe('clipEffectFilters', () => {
  it('exposes the six launch presets', () => {
    expect(Object.keys(CLIP_EFFECT_PRESETS).sort()).toEqual(
      ['bloom', 'film_grain', 'fisheye', 'motion_blur', 'shake', 'vhs']
    )
  })

  it('maps preset ids to ffmpeg filter strings in order', () => {
    const filters = clipEffectFilters(['film_grain', 'fisheye'])
    expect(filters).toHaveLength(2)
    expect(filters[0]).toContain('noise=')
    expect(filters[1]).toContain('lenscorrection=')
  })

  it('ignores unknown preset ids and handles empty/missing input', () => {
    expect(clipEffectFilters(['nope'])).toEqual([])
    expect(clipEffectFilters([])).toEqual([])
    expect(clipEffectFilters(undefined)).toEqual([])
  })
})

describe('effects in the composite plan', () => {
  it('schema parses clips without effects (back-compat) and defaults to []', () => {
    const state = avState()
    const clip = state.tracks[0]!.clips[0]!
    expect('effects' in clip && clip.effects).toEqual([])
  })

  it('produces an identical filtergraph when effects are absent vs empty', () => {
    const a = buildCompositePlan(avState(), profile)
    const b = buildCompositePlan(avState([]), profile)
    expect(a.filterComplex).toBe(b.filterComplex)
  })

  it('injects effect filters into the clip chain', () => {
    const plan = buildCompositePlan(avState(['film_grain', 'shake']), profile)
    expect(plan.filterComplex).toContain('noise=')
    expect(plan.filterComplex).toContain('crop=in_w-16')
    // Effects apply per-clip, before the timeline offset setpts
    const clipChain = plan.filterComplex.split(';').find(c => c.startsWith('[0:v]'))!
    expect(clipChain.indexOf('noise=')).toBeLessThan(clipChain.indexOf('setpts=PTS-STARTPTS+0.000'))
  })

  it('does not change the graph for unknown effect ids', () => {
    const plain = buildCompositePlan(avState(), profile)
    const unknown = buildCompositePlan(avState(['not_a_preset']), profile)
    expect(unknown.filterComplex).toBe(plain.filterComplex)
  })
})

describe('clip framing in the composite plan', () => {
  it('preserves legacy defaults for missing fit values', () => {
    expect(resolveVideoClipFit({ base_source: 'uploaded_footage' })).toBe('fit')
    expect(resolveVideoClipFit({ base_source: 'still_kenburns' })).toBe('crop')
  })

  it('maps framing modes to ffmpeg scale filters', () => {
    expect(videoClipFitFilters({ fit: 'fit' }, 1080, 1920)).toEqual([
      'scale=1080:1920:force_original_aspect_ratio=decrease',
      'pad=1080:1920:(ow-iw)/2:(oh-ih)/2',
    ])
    expect(videoClipFitFilters({ fit: 'crop' }, 1080, 1920)).toEqual([
      'scale=1080:1920:force_original_aspect_ratio=increase',
      'crop=1080:1920',
    ])
    expect(videoClipFitFilters({ fit: 'fill' }, 1080, 1920)).toEqual(['scale=1080:1920'])
  })

  it('injects crop framing into the clip chain', () => {
    const state = TimelineStateSchema.parse({
      schema_version: 2,
      media_type: 'av',
      tracks: [{
        id: 'vid',
        name: 'V',
        kind: 'video',
        clips: [{
          type: 'video',
          id: 'f1',
          r2_key: 'm/f.mp4',
          timeline_start_sec: 0,
          duration_sec: 5,
          base_source: 'uploaded_footage',
          fit: 'crop',
        }]
      }]
    })
    const plan = buildCompositePlan(state, profile)
    expect(plan.filterComplex).toContain('scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920')
  })
})
