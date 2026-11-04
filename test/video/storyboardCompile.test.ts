import { describe, expect, it } from 'vitest'
import { compileStoryboard, type ResolvedStoryboard } from '~~/shared/video/storyboardCompile'
import { TimelineStateSchema, validateTimeline } from '~~/server/utils/audio/timelineSchema'
import { storyboardFixture, id } from './fixtures/storyboard'

export function resolvedFixture(): ResolvedStoryboard {
  const plan = storyboardFixture()
  plan.copy.scriptSegments = []
  plan.copy.cues = []
  for (const shot of plan.shots) {
    shot.spokenSegmentIds = []
    shot.copyCueIds = []
  }
  return { plan, formats: ['reels_9x16'], findings: [], assets: {
    [`video_asset:${id(20)}`]: { kind: 'video', assetId: id(20), contentHash: 'b'.repeat(64), r2Key: 'owned/video.mp4', durationSeconds: 10, width: 1080, height: 1920 }
  }, overlays: {} }
}
const codes = (resolved: ResolvedStoryboard) => compileStoryboard(resolved).findings.map(f => f.code)
describe('deterministic storyboard compilation', () => {
  it('compiles six shots/900 frames, repeated source uses and explicit silence', () => {
    const input = resolvedFixture()
    const result = compileStoryboard(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline.duration_sec).toBe(30)
    expect(result.timeline.tracks.find(t => t.kind === 'video')?.clips.map(c => c.timeline_start_sec)).toEqual([0, 5, 10, 15, 20, 25])
    expect(new Set(result.timeline.tracks.flatMap(t => t.clips.map(c => c.id))).size).toBe(6)
    expect(result.timeline.tracks.find(t => t.kind === 'music')?.clips).toEqual([])
    expect(validateTimeline(result.timeline)).toEqual({ ok: true })
    expect(compileStoryboard(input)).toEqual(result)
    expect(TimelineStateSchema.parse(JSON.parse(JSON.stringify(result.timeline)))).toEqual(result.timeline)
    expect(result.obligations.sources).toHaveLength(6)
  })
  it('converts nonzero source bounds from frames, without rounding to seconds', () => {
    const input = resolvedFixture()
    input.plan.shots[0].visual = { ...input.plan.shots[0].visual, sourceInFrames: 1, sourceOutFrames: 151 } as Extract<typeof input.plan.shots[0]['visual'], { status: 'bound' }>
    const result = compileStoryboard(input)
    expect(result.ok && result.timeline.tracks[0].clips[0]).toMatchObject({ source_in_sec: 1 / 30, source_out_sec: 151 / 30 })
  })
  it.each([['short', 4, 'source_too_short'], ['unmeasured', null, 'media_unmeasured']] as const)('blocks %s footage', (_, duration, code) => {
    const input = resolvedFixture()
    input.assets[`video_asset:${id(20)}`].durationSeconds = duration
    expect(codes(input)).toContain(code)
  })
  it('blocks required overlay absent and copy without approval', () => {
    const input = resolvedFixture()
    input.plan.copy.cues = [{ id: 'offer', text: 'Exact  ', required: true }]
    input.plan.shots[0].copyCueIds = ['offer']
    expect(codes(input)).toContain('required_overlay_missing')
    input.plan.copy.approval = null
    expect(codes(input)).toContain('copy_not_approved')
  })
  it('blocks speech without reviewed voice and captions outside speech', () => {
    const input = resolvedFixture()
    const shot = input.plan.shots[0]
    input.plan.copy.scriptSegments = [{ id: 'speech', text: 'Exact speech' }]
    shot.spokenSegmentIds = ['speech']
    expect(codes(input)).toContain('voice_timing_unresolved')
    shot.audioCues = [{ id: 'vo', kind: 'voiceover', required: true, startFrame: 30, durationFrames: 60, timing: 'reviewed', asset: { status: 'bound', sourceKind: 'audio_asset', assetId: id(21), contentHash: 'c'.repeat(64) } }]
    input.assets[`audio_asset:${id(21)}`] = { kind: 'audio', assetId: id(21), contentHash: 'c'.repeat(64), r2Key: 'owned/vo.wav', durationSeconds: 2, speechText: 'Exact speech' }
    shot.captionCues = [{ id: 'cap', spokenSegmentId: 'speech', startFrame: 0, durationFrames: 60, timing: 'reviewed' }]
    expect(codes(input)).toContain('caption_outside_speech')
    shot.captionCues[0].startFrame = 30
    const result = compileStoryboard(input)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.timeline.tracks.find(t => t.kind === 'caption')?.clips[0]).toMatchObject({ text: 'Exact speech', timeline_start_sec: 1, duration_sec: 2 })
  })
})

describe('required overlay and adjustment contracts', () => {
  it('compiles exact overlay layouts and retains independent obligations after provenance is stripped', async () => {
    const input = resolvedFixture()
    const shot = input.plan.shots[0]
    input.plan.copy.cues = [{ id: 'offer', text: 'Exact offer  \n*Terms', required: true }]
    shot.copyCueIds = ['offer']
    shot.overlayCues = [{ id: 'offer-layer', copyCueId: 'offer', startFrame: 0, durationFrames: 150, asset: { status: 'bound', sourceKind: 'banner_project', assetId: id(22), contentHash: 'd'.repeat(64) } }]
    input.overlays[`${shot.id}:offer-layer`] = { assetId: id(22), contentHash: 'd'.repeat(64), copyCueId: 'offer', text: input.plan.copy.cues[0].text, layouts: { reels_9x16: { formatKey: 'fb_story', layoutHash: 'e'.repeat(64) } } }
    const result = compileStoryboard(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.obligations.cues[0]).toMatchObject({ required: true, text: 'Exact offer  \n*Terms' })
    const { storyboardApprovalChanges } = await import('~~/shared/video/storyboardCompile')
    const changed = structuredClone(result.timeline)
    changed.tracks.forEach(t => t.clips.forEach(c => delete c.storyboard))
    expect(storyboardApprovalChanges(result.timeline, changed, result.obligations)).toEqual([])
    changed.tracks.find(t => t.kind === 'overlay')!.clips = []
    expect(storyboardApprovalChanges(result.timeline, changed, result.obligations)).toEqual([expect.objectContaining({ clipId: result.obligations.cues[0].clipId, reasons: ['presence'] })])
    input.formats.push('square_1x1')
    expect(codes(input)).toContain('overlay_unresolved')
  })
  it('marks only trimmed clip timing stale and survives editor trim/schema roundtrip', async () => {
    const result = compileStoryboard(resolvedFixture())
    if (!result.ok) throw new Error('fixture')
    const { trimVisualClip } = await import('~~/app/utils/audio/timelineEdit')
    const { storyboardApprovalChanges } = await import('~~/shared/video/storyboardCompile')
    const before = result.timeline
    const changed = trimVisualClip(before, { clipId: before.tracks[0].clips[0].id, edge: 'end', newTimeSec: 4 })
    const clip = changed.tracks[0].clips[0]
    if (clip.type !== 'video') throw new Error('fixture')
    expect(storyboardApprovalChanges(before, changed, result.obligations)).toEqual([{ clipId: clip.id, reasons: ['timing'] }])
    expect(TimelineStateSchema.parse(changed).tracks[0].clips[0].storyboard).toEqual(clip.storyboard)
  })
})

describe('selected audio and still media', () => {
  it('emits selected music/SFX and measured still images on existing lanes', () => {
    const input = resolvedFixture()
    input.assets[`video_asset:${id(20)}`] = { ...input.assets[`video_asset:${id(20)}`], kind: 'image', durationSeconds: null }
    input.assets[`audio_asset:${id(21)}`] = { kind: 'audio', assetId: id(21), contentHash: 'c'.repeat(64), r2Key: 'owned/music.wav', durationSeconds: 5 }
    input.plan.shots[0].audioCues = ['music', 'sfx'].map(kind => ({ id: kind, kind: kind as 'music' | 'sfx', required: true, timing: 'reviewed', startFrame: 0, durationFrames: 150, asset: { status: 'bound', sourceKind: 'audio_asset', assetId: id(21), contentHash: 'c'.repeat(64) } }))
    const result = compileStoryboard(input)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.timeline.tracks.find(t => t.kind === 'video')?.clips[0]).toMatchObject({ base_source: 'still_kenburns', kenburns: { zoom_from: 1 } })
    for (const kind of ['music', 'sfx']) expect(result.timeline.tracks.find(t => t.kind === kind)?.clips[0]).toMatchObject({ type: 'audio', r2_key: 'owned/music.wav', source_out_sec: 5 })
    expect(new Set(result.timeline.tracks.flatMap(t => t.clips.map(c => c.id))).size).toBe(8)
  })
})

describe('review regressions: complete voice and render-affecting edits', () => {
  it('rejects a short extract of a longer matching speech recording', () => {
    const input = resolvedFixture()
    input.plan.copy.scriptSegments = [{ id: 'speech', text: 'Approved speech' }]
    const shot = input.plan.shots[0]
    shot.spokenSegmentIds = ['speech']
    shot.audioCues = [{ id: 'voice', kind: 'voiceover', required: true, startFrame: 0, durationFrames: 60, timing: 'reviewed', asset: { status: 'bound', sourceKind: 'audio_asset', assetId: id(21), contentHash: 'c'.repeat(64) } }]
    input.assets[`audio_asset:${id(21)}`] = { kind: 'audio', assetId: id(21), contentHash: 'c'.repeat(64), r2Key: 'owned/voice.wav', durationSeconds: 20, speechText: 'Approved speech' }
    expect(codes(input)).toContain('voice_source_range_unreviewed')
    input.assets[`audio_asset:${id(21)}`].durationSeconds = 2.01
    expect(compileStoryboard(input).ok).toBe(true)
    const binding = shot.audioCues[0].asset
    if (binding.status !== 'bound') throw new Error('fixture')
    binding.sourceInFrames = 1
    binding.sourceOutFrames = 61
    input.assets[`audio_asset:${id(21)}`].durationSeconds = 61 / 30
    expect(codes(input)).toContain('voice_source_range_unreviewed')
  })
  it('invalidates source mode and only audio affected by ducking rule/source changes', async () => {
    const input = resolvedFixture()
    const shot = input.plan.shots[0]
    input.assets[`audio_asset:${id(21)}`] = { kind: 'audio', assetId: id(21), contentHash: 'c'.repeat(64), r2Key: 'owned/music.wav', durationSeconds: 5 }
    shot.audioCues = ['music', 'sfx'].map(kind => ({ id: kind, kind: kind as 'music' | 'sfx', required: true, timing: 'reviewed', startFrame: 0, durationFrames: 150, asset: { status: 'bound', sourceKind: 'audio_asset', assetId: id(21), contentHash: 'c'.repeat(64) } }))
    const result = compileStoryboard(input)
    if (!result.ok) throw new Error('fixture')
    const { storyboardApprovalChanges } = await import('~~/shared/video/storyboardCompile')
    const before = result.timeline
    const changed = structuredClone(before)
    const visual = changed.tracks[0].clips[0]
    if (visual.type !== 'video') throw new Error('fixture')
    visual.base_source = 'still_kenburns'
    expect(storyboardApprovalChanges(before, changed, result.obligations)).toEqual([{ clipId: visual.id, reasons: ['source'] }])
    visual.base_source = 'uploaded_footage'
    const targetId = changed.tracks.find(t => t.kind === 'music')!.clips[0].id
    changed.ducking = [{ id: 'duck', source_track_id: 'sb-sfx', target_track_id: 'sb-music', amount_db: -12, attack_ms: 50, release_ms: 300, threshold_db: -30 }]
    expect(storyboardApprovalChanges(before, changed, result.obligations)).toEqual([{ clipId: targetId, reasons: ['timing'] }])
    const ducked = structuredClone(changed)
    changed.tracks.find(t => t.kind === 'sfx')!.clips[0].timeline_start_sec = 1
    expect(storyboardApprovalChanges(ducked, changed, result.obligations)).toEqual(expect.arrayContaining([{ clipId: targetId, reasons: ['timing'] }]))
    expect(storyboardApprovalChanges(ducked, before, result.obligations)).toEqual([{ clipId: targetId, reasons: ['timing'] }])
  })
})
