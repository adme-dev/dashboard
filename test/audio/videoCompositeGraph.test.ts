import { describe, it, expect } from 'vitest'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import { videoFormatFor } from '~~/server/utils/audio/videoProfiles'
import { buildCompositePlan, buildCompositeRenderArgs } from '~~/server/utils/audio/videoCompositeGraph'

const profile = videoFormatFor('reels_9x16')!

function avState() {
  return TimelineStateSchema.parse({
    schema_version: 2, media_type: 'av',
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', clips: [
        { type: 'video', id: 'f1', r2_key: 'media/f1.mp4', timeline_start_sec: 0, duration_sec: 6, source_in_sec: 2, source_out_sec: 8, base_source: 'uploaded_footage' },
        { type: 'video', id: 's1', r2_key: 'media/s1.jpg', timeline_start_sec: 6, duration_sec: 4, base_source: 'still_kenburns', kenburns: { zoom_from: 1, zoom_to: 1.2 } }
      ] },
      { id: 'ovl', name: 'Overlay', kind: 'overlay', clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 10, gsap_project_id: 'b1' }
      ] },
      { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
        { id: 'a1', r2_key: 'audio/vo.mp3', timeline_start_sec: 0, source_out_sec: 10 }
      ] },
      { id: 'music', name: 'Music', kind: 'music', clips: [
        { id: 'a2', r2_key: 'audio/music.mp3', timeline_start_sec: 0, source_out_sec: 10 }
      ] }
    ]
  })
}

describe('buildCompositePlan', () => {
  it('orders inputs as video-clips then audio-clips (overlay clips excluded)', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(p.inputs.map(i => i.r2_key)).toEqual(['media/f1.mp4', 'media/s1.jpg', 'audio/vo.mp3', 'audio/music.mp3'])
  })
  it('builds a black base canvas at the profile size/fps', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(p.filterComplex).toContain('color=c=black:s=1080x1920:r=30')
  })
  it('trims + scales footage and positions it by timeline_start', () => {
    const fc = buildCompositePlan(avState(), profile).filterComplex
    expect(fc).toContain('[0:v]trim=start=2:end=8')
    expect(fc).toContain('overlay=enable=\'between(t,0.000,6.000)\'')
  })
  it('uses zoompan for the still and positions it', () => {
    const fc = buildCompositePlan(avState(), profile).filterComplex
    expect(fc).toContain('[1:v]')
    expect(fc).toContain('zoompan')
    expect(fc).toContain('overlay=enable=\'between(t,6.000,10.000)\'')
  })
  it('outputs [vout] yuv420p', () => {
    expect(buildCompositePlan(avState(), profile).filterComplex).toContain('format=yuv420p[vout]')
  })
  it('folds in the audio filtergraph with input indices offset by the video count (2)', () => {
    const fc = buildCompositePlan(avState(), profile).filterComplex
    // audio inputs are ffmpeg inputs 2 and 3 → audio chain must reference [2:a]/[3:a], never [0:a]/[1:a]
    expect(fc).toContain('[2:a]')
    expect(fc).toContain('[3:a]')
    expect(fc).not.toMatch(/\[0:a\]|\[1:a\]/)
    expect(fc).toContain('[aout]')   // renamed from [mix]
  })
  it('exposes [vout] and [aout] labels', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(p.vLabel).toBe('[vout]'); expect(p.aLabel).toBe('[aout]')
  })
})

describe('buildCompositeRenderArgs', () => {
  it('maps both video and audio and encodes h264/aac per profile', () => {
    const p = buildCompositePlan(avState(), profile)
    const a = buildCompositeRenderArgs(p, ['f1','s1','vo','music'], 'out.mp4')
    expect(a.filter(x => x === '-map')).toHaveLength(2)
    expect(a[a.indexOf('-map') + 1]).toBe('[vout]')
    expect(a).toContain('libx264'); expect(a).toContain('aac')
    expect(a[a.indexOf('-pix_fmt') + 1]).toBe('yuv420p')
    expect(a[a.length - 1]).toBe('out.mp4')
  })
  it('throws when inputPaths length != plan.inputs length', () => {
    const p = buildCompositePlan(avState(), profile)
    expect(() => buildCompositeRenderArgs(p, ['only-one'], 'out.mp4')).toThrow()
  })
})

describe('buildCompositePlan with overlays', () => {
  it('appends overlay frame-sequence inputs and composites them onto [vout]', () => {
    const overlays = [{ clipId: 'o1', framesPattern: 'ovl_o1/%05d.png', fps: 30, timeline_start_sec: 0, duration_sec: 10 }]
    const p = buildCompositePlan(avState(), profile, overlays)
    // overlay frames become an extra image input; composited via overlay=enable
    expect(p.overlayInputs.map(o => o.framesPattern)).toEqual(['ovl_o1/%05d.png'])
    expect(p.filterComplex).toContain("overlay=enable='between(t,0.000,10.000)'")
    expect(p.vLabel).toBe('[vout]')
  })
  it('without overlays behaves exactly as V1.2a (base only)', () => {
    const a = buildCompositePlan(avState(), profile)
    const b = buildCompositePlan(avState(), profile, [])
    expect(a).toEqual(b)
  })
})

describe('buildCompositePlan with captions', () => {
  function withCaption(style: 'platform_default' | 'bold_social' | 'subtitle_safe' = 'platform_default') {
    const state = avState()
    state.tracks.push({
      id: 'cap',
      name: 'Captions',
      kind: 'caption',
      gain_db: 0,
      muted: false,
      locked: false,
      hidden: false,
      clips: [
        {
          type: 'caption',
          id: 'cap1',
          timeline_start_sec: 1,
          duration_sec: 4,
          text: 'Big offer this weekend only',
          source_asset_id: 'asset-1',
          caption_vtt_url: '/captions.vtt',
          style,
        } as any
      ]
    } as any)
    return state
  }

  it('burns caption clips into the video chain without adding media inputs', () => {
    const state = withCaption()
    const p = buildCompositePlan(state, profile)
    expect(p.inputs.map(i => i.r2_key)).toEqual(['media/f1.mp4', 'media/s1.jpg', 'audio/vo.mp3', 'audio/music.mp3'])
    expect(p.filterComplex).toContain('drawtext=')
    expect(p.filterComplex).toContain("enable='between(t,1.000,5.000)'")
  })

  it('maps caption style presets to distinct drawtext settings', () => {
    const platform = buildCompositePlan(withCaption('platform_default'), profile).filterComplex
    const bold = buildCompositePlan(withCaption('bold_social'), profile).filterComplex
    const safe = buildCompositePlan(withCaption('subtitle_safe'), profile).filterComplex

    expect(platform).toContain('fontsize=83')
    expect(platform).toContain('boxcolor=black@0.62')
    expect(platform).toContain('y=h-text_h-106')
    expect(bold).toContain('fontsize=108')
    expect(bold).toContain('boxcolor=black@0.70')
    expect(bold).toContain('borderw=2')
    expect(bold).toContain('y=h-text_h-173')
    expect(safe).toContain('fontsize=69')
    expect(safe).toContain('boxcolor=black@0.50')
    expect(safe).toContain('y=h-text_h-230')
  })
})
